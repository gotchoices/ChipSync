import { Topology } from "../topology";

export const SignatureType = { promise: 1, nopromise: -1, commit: 2, nocommit: -2 } as const;

export interface Signature {
	type: number; // SignatureType
	key: string;
	value: string;
}

export interface TrxRecord {
	transactionCode: string;	// Identifier unique to this transaction
	sessionCode: string;    	// Random identifier used to anonymize node links
	payload: any;
	topology: Topology
	start: number;	// UNIX timestamp
	promisesDue: number;
	promises: Signature[];
	commitsDue: number;
	commits: Signature[];
}
