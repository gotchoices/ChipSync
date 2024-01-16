import { CodeOptions } from "chipcode";
import { TrxParticipantState } from "./participant-state";

export class MemoryTrxParticipantState implements TrxParticipantState {
	private _keyPair: KeyPair;

	constructor (
		public codeOptions: CodeOptions,
		keyPair?: KeyPair
	) {
		this._keyPair = keyPair || generateKeyPair();
	}

	async getOurKey(sessionCode: string): Promise<string> {
		throw new Error("Method not implemented.");
	}

}
