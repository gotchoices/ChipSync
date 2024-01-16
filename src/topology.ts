export interface PublicLink {
	sourceKey: string;
	targetKey: string;
	nonce: string;
	terms: any;
}

export interface Member {
	url?: string;			// Logical and possibly physical address of member
	secret?: string;	// Member managed encrypted path segment or other agent memory
	isReferee: boolean;
	isParticipant: boolean;
}

export interface Topology {
	links: PublicLink[];	// Anonymized links
	members: Record<string, Member>;	// Nodes by key
}
