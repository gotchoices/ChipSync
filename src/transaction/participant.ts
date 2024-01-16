import { validateCode } from "chipcode";
import { TrxParticipantState } from "./participant-state";
import { Signature, SignatureType, TrxRecord } from "./record";
import * as crypto from 'crypto';
import { signDigest, verifyDigest } from "../asymmetric";

interface RecordState {
	ourPromiseNeeded: boolean,
	fullyPromised?: boolean,
	ourCommitNeeded?: boolean,
	consensusCommitted?: boolean,
	fullyCommitted?: boolean
};

export class TrxParticipant {
	constructor(
		public state: TrxParticipantState,
	) { }

	public async update(record: TrxRecord, fromKey?: string): Promise<void> {
		if (fromKey) {
			await this.state.setPeerRecord(fromKey, record);
		}

		// Load the prior known state of the record from state
		var prior = await this.state.getTransaction(record.transactionCode);
		try {
			const merged = await this.validateAndMerge(prior, record);
			const recordState = await this.getRecordState(merged);
			if (recordState.ourPromiseNeeded) {
				const modified = await this.addOurPromise(merged);
				this.pushModified(modified);
			} else if (recordState.ourCommitNeeded) {
				const modified = await this.addOurCommit(merged);
				this.pushModified(modified);
			} else {
				this.pushModified(merged);
			}
		}
		catch (err) {
			await this.state.logInvalid(record, err);
			throw err;
		}
	}

	async pushModified(record: TrxRecord) {

		const reachablePeers = this.getReachablePeers(record);
		const updates = reachablePeers.map(async key => {
			const peerRecord = await this.state.getPeerRecord(key, record.transactionCode);
			if (!peerRecord || recordStale(peerRecord, record)) {
				await this.state.pushPeerRecord(key, record);
			}
		});
		await Promise.all(updates);
	}

	private async getReachablePeers(record: TrxRecord) {
		const ourKey = await this.state.getOurKey(record.sessionCode);
		return Object.entries(record.topology.members).filter(m => hasPhysical(m[1].url)).map(m => m[0])
			.concat(record.topology.links.filter(l => l.sourceKey === ourKey || l.targetKey === ourKey).map(l => l.sourceKey === ourKey ? l.targetKey : l.sourceKey));
	}

	private async addOurCommit(record: TrxRecord) {
		const approved = await this.state.shouldCommit(record) && record.commitsDue <= Date.now();
		const sigType = approved ? SignatureType.commit : SignatureType.nocommit;
		const digest = getCommitDigest(record, [sigType.toString()]);
		const ourKey = await this.state.getOurKey(record.sessionCode);
		const modified = {
			...record,
			commits: [...record.commits, { type: sigType, key: ourKey, value: await this.state.sign(digest) }]
		};
		return modified;
	}

	private async addOurPromise(record: TrxRecord) {
		const approved = await this.state.shouldPromise(record) && record.promisesDue <= Date.now();
		const sigType = approved ? SignatureType.promise : SignatureType.nopromise;
		const digest = getPromiseDigest(record, [sigType.toString()]);
		const ourKey = await this.state.getOurKey(record.sessionCode);
		const modified = {
			...record,
			promises: [...record.promises, { type: sigType, key: ourKey, value: await this.state.sign(digest) }]
		};
		return modified;
	}

	async validateAndMerge(prior: TrxRecord, record: TrxRecord) {
		if (!prior) {
			await this.validateNew(record);
			return record;
		} else {
			this.validateUpdate(prior, record);
			return { ...prior, ...record, promises: mergeSignatures(prior.promises, record.promises), commits: mergeSignatures(prior.commits, record.commits) }
		}
	}

	validateUpdate(prior: TrxRecord, record: TrxRecord) {
		if (record.transactionCode != prior.transactionCode) throw new Error("Transaction code mismatch");
		if (record.sessionCode != prior.sessionCode) throw new Error("Session code mismatch");
		if (JSON.stringify(record.payload) != JSON.stringify(prior.payload)) throw new Error("Payload mismatch");
		if (JSON.stringify(record.topology) != JSON.stringify(prior.topology)) throw new Error("Topology mismatch");
	}

	async validateNew(record: TrxRecord) {
		// Verify that the transaction code is random enough
		if (!validateCode(record.transactionCode, this.state.codeOptions)) throw new Error("Transaction code is insufficiently random");

		// Verify that the session code is random enough
		if (!validateCode(record.sessionCode, this.state.codeOptions)) throw new Error("Session code is insufficiently random");

		if (record.start > Date.now()) throw new Error("Start time is in the future");

		if (record.promisesDue < record.start + this.state.timingOptions.minPromiseTime) throw new Error("Promises due time is too early");

		// TODO: ensure that this record matches our knowledge of the session
	}

	async getRecordState(record: TrxRecord): Promise<RecordState> {
		const participants = Object.keys(record.topology.members).filter(key => record.topology.members[key].isParticipant);
		// No duplicate promise signatures should be present
		if (record.promises.length !== new Set(record.promises.map(p => p.key)).size) throw new Error(`Duplicate promise signatures present`);
		// Any promise signatures should be for participants
		if (record.promises.some(p => !participants.includes(p.key))) throw new Error(`Promise signature is not for a participant`);
		// Validate all present promise signatures
		const promiseDigest = getPromiseDigest(record);
		record.promises.forEach(p => {
			if (!verifyDigest(p.key, promiseDigest, p.value)) throw new Error(`Promise signature for ${p.key} is invalid`);
		});

		const ourKey = await this.state.getOurKey(record.sessionCode);
		const ourPromiseNeeded = participants.includes(ourKey) && !record.promises.some(p => p.key === ourKey);

		if (!ourPromiseNeeded) {
			const fullyPromised = participants.every(p => record.promises.some(s => s.key == p));

			if (fullyPromised) {
				// No duplicate commit signatures should be present
				if (record.commits.length !== new Set(record.commits.map(p => p.key)).size) throw new Error(`Duplicate commit signatures present`);

				const referees = Object.keys(record.topology.members).filter(key => record.topology.members[key].isReferee);
				// Any commit signatures should be for a referee
				if (record.commits.some(p => !referees.includes(p.key))) throw new Error(`Commit signature is not for a referee`);

				// Validate all present commit signatures
				const commitDigest = getCommitDigest(record);
				record.commits.forEach(p => {
					if (!verifyDigest(p.key, commitDigest, p.value)) throw new Error(`Commit signature for ${p.key} is invalid`);
				});

				const ourCommitNeeded = referees.includes(ourKey) && !record.commits.some(p => p.key === ourKey);
				const consensusCommitted = record.commits.length >= Math.ceil(referees.length / 2);
				const fullyCommitted = record.commits.length == referees.length;
				return { ourPromiseNeeded, fullyPromised, ourCommitNeeded, consensusCommitted, fullyCommitted };
			} else {
				if (record.commits.length !== 0) throw new Error(`Commit signatures present on un-promised transaction`);
			}
			return { ourPromiseNeeded, fullyPromised };
		}
		if (record.commits.length !== 0) throw new Error(`Commit signatures present on un-promised transaction`);
		return { ourPromiseNeeded };
	}
}

function createDigest(trx: TrxRecord, additionalData: string[] = []) {
	const hash = crypto.createHash('sha256');
	hash.update(trx.transactionCode);
	hash.update(trx.sessionCode);
	hash.update(JSON.stringify(trx.payload));
	hash.update(JSON.stringify(trx.topology));
	hash.update(trx.start.toString());
	hash.update(trx.promisesDue.toString());
	hash.update(trx.commitsDue.toString());

	additionalData.forEach(data => {
			hash.update(data);
	});

	return hash.digest('base64');
}

function getPromiseDigest(trx: TrxRecord, additionalData: string[] = []) {
	return createDigest(trx, additionalData);
}

function getCommitDigest(trx: TrxRecord, additionalData: string[] = []) {
	const adds = trx.promises.map(p => JSON.stringify(p));
	return createDigest(trx, [...adds, ...additionalData]);
}

function mergeSignatures(sigs1: Signature[], sigs2: Signature[]) {
	const candidates = [...sigs1];
	sigs2.forEach(p => {
		const index = candidates.findIndex(s => s.key == p.key);
		if (index >= 0) {
			const match = candidates[index];
			if (match.value !== p.value || match.type !== p.type) throw new Error(`Signature or type for ${p.key} has changed`);
			candidates.splice(index, 1);
		}
	});
	return [...candidates, ...sigs2];
}
