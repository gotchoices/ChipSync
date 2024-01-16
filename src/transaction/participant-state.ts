import { CodeOptions } from "chipcode";

export interface TrxParticipantState {
	codeOptions: CodeOptions;
	getOurKey(sessionCode: string): Promise<string>;
}
