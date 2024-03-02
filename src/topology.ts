export type Terms = any;

export interface Link {
	target: string;
	nonce: string;
	terms: Terms;
}

/** 1 = Participant, 2 = Referee.  Node: All nodes can act as relays. */
export type MemberType = 1 | 2;
export const MemberTypes: Record<string, MemberType> = { participant: 1, referee: 2 } as const;

export interface Member {
	url?: string;			// Logical and possibly physical address of member
	secret?: string;	// Member managed encrypted path segment or other agent memory
	types: MemberType[];
}

export interface Topology {
	links: Record<string, Link>;	// Anonymized links by source participant key
	members: Record<string, Member>;	// Nodes by key
}

/** @returns the participant paths within the topology */
