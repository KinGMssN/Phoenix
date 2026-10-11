import os from 'node:os';
import { syncBuiltinESMExports } from 'node:module';

const systemUserInfo = os.userInfo.bind(os);
os.userInfo = (...args) => {
  try {
    return systemUserInfo(...args);
  } catch {
    return {
      uid: -1,
      gid: -1,
      username: process.env.USERNAME || 'opendots',
      homedir: process.env.USERPROFILE || os.tmpdir(),
      shell: null,
    };
  }
};
syncBuiltinESMExports();
