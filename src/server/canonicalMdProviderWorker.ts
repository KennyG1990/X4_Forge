import { parentPort, workerData } from 'node:worker_threads';
import { readCanonicalMdProviderCatalog } from '../lib/canonicalMdProviderCatalog';

if (!parentPort || typeof workerData?.root !== 'string') throw new Error('Canonical MD worker requires an owned root.');
parentPort.postMessage(readCanonicalMdProviderCatalog(workerData.root));
parentPort.close();
