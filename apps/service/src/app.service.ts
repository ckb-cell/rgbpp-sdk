import { RpcHandler, RpcMethodHandler } from 'src/json-rpc/json-rpc.decorators';
import * as pkg from '../package.json';

@RpcHandler()
export class AppService {
  @RpcMethodHandler({ name: 'get_version' })
  public getAppVersion(): string {
    return pkg.version;
  }
}
