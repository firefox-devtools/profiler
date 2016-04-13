import { ProfilePreprocessor } from './preprocess-profile';
import { provideWorkerSide } from './promise-worker';

provideWorkerSide(self, ProfilePreprocessor);
