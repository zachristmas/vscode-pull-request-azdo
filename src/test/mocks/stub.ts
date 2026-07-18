import { SinonStubbedInstance } from 'sinon';

// SinonStubbedInstance<T> drops private members, so it is not structurally assignable to T;
// this is the one sanctioned cast for handing stubs to constructors expecting the real class.
export function asReal<T>(stub: SinonStubbedInstance<T>): T {
	return (stub as unknown) as T;
}
