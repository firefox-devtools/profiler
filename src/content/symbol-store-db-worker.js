import { SymbolStoreDB } from './symbol-store-db';
import { provideWorkerSide } from './promise-worker';

provideWorkerSide(self, SymbolStoreDB);
