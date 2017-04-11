import { ProfileProcessor } from './process-profile';
import { provideWorkerSide } from './promise-worker';

provideWorkerSide(self, ProfileProcessor);
