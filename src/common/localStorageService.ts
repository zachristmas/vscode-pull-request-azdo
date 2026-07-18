import { Memento } from 'vscode';

export class LocalStorageService {
	constructor(private storage: Memento) {}

	public getValue<T>(key: string, defaultValue?: T   | null): T {
		// Memento.get's default param is T; preserve this class's historical looser contract
		return this.storage.get<T>(key, defaultValue as T);
	}

	public setValue<T>(key: string, value: T) {
		this.storage.update(key, value);
	}
}
