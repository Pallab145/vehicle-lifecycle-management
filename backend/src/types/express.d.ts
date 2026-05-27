import type { RequestContext, CallerIdentity } from './index';

declare global {
    namespace Express {
        interface Request {
            context: RequestContext;
            caller?: CallerIdentity;
        }
    }
}
