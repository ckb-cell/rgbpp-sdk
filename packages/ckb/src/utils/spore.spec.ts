import { describe, it, expect } from 'vitest';
import { generateClusterId, generateSporeCreateCoBuild } from './spore';
import { IndexerCell } from '../types';

describe('spore utils', () => {
  it('generateClusterId', () => {
    const firstInput = {
      previousOutput: {
        txHash: '0x047b6894a0b7a4d7a73b1503d1ae35c51fc5fa6306776dcf22b1fb3daaa32a29',
        index: '0x0',
      },
      since: '0x0',
    };

    const typeId = generateClusterId(firstInput, 0);
    expect(typeId).toBe('0xdc03ec5c4086fcb813707c6dd8bf5b9848d7e335e9c39389bfc9e6f9e65150ca');
  });

  it('generateClusterId', () => {
    const ckbTx: CKBComponents.RawTransaction = JSON.parse(
      `{"version":"0x0","cellDeps":[{"outPoint":{"txHash":"0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00","index":"0x0"},"depType":"code"},{"outPoint":{"txHash":"0xf1de59e973b85791ec32debbba08dff80c63197e895eb95d67fc1e9f6b413e00","index":"0x1"},"depType":"code"},{"outPoint":{"txHash":"0xcebb174d6e300e26074aea2f5dbd7f694bb4fe3de52b6dfe205e54f90164510a","index":"0x0"},"depType":"code"},{"outPoint":{"txHash":"0x5e8d2a517d50fd4bb4d01737a7952a1f1d35c8afc77240695bb569cd7d9d5a1f","index":"0x0"},"depType":"code"},{"outPoint":{"txHash":"0x6550bd4d93d121e3cb41754c4d77dbd23d87197504f415eeddce96f229edae8f","index":"0x1"},"depType":"code"},{"outPoint":{"txHash":"0xf8de3bb47d055cdf460d93a2a6e1b05f7432f9777c8c474abf4eec1d4aee5d37","index":"0x0"},"depType":"depGroup"}],"headerDeps":[],"inputs":[{"previousOutput":{"index":"0x0","txHash":"0xf0c18d9511cb7cd64901c7b7eff7e3e9ba0ec51a21b2c5d3c8edba938ef43b07"},"since":"0x0"},{"previousOutput":{"txHash":"0x17a43bd8694e976bdbf4fa74cbd503d9846e9d7c5b3501925d35aef17dbaf4da","index":"0x1"},"since":"0x0"},{"previousOutput":{"txHash":"0xadf1c0462013cb46cb4bb3420ec564b3af9e96a6d15f27526aeb34f78d54285f","index":"0x2"},"since":"0x0"},{"previousOutput":{"txHash":"0xe22ebc15d15117c9d34885acf9dac3c9d71f4a5541a63ff25ad5135dc52ca9b1","index":"0x2"},"since":"0x0"},{"previousOutput":{"txHash":"0xf56d3a5f9a5634f6447fcafd0fc3cad4bde25efcb1d4f54a6d097bc6755f82e3","index":"0x2"},"since":"0x0"}],"outputs":[{"capacity":"0x4c5e51c9d","lock":{"codeHash":"0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248","hashType":"type","args":"0x0100000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5"},"type":{"args":"0xbc5168a4f90116fada921e185d4b018e784dc0f6266e539a3c092321c932700a","codeHash":"0x0bbe768b519d8ea7b96d58f1182eb7e6ef96c541fbd9526975077ee09f049058","hashType":"data1"}},{"lock":{"codeHash":"0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248","hashType":"type","args":"0x0200000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5"},"type":{"codeHash":"0x685a60219309029d01310311dba953d67029170ca4848a4ff638e57002130a0d","hashType":"data1","args":"0x205fe15af04e59d3ff1ff8e0b0a1e3bc201af406a38964760c24848ed6029b6b"},"capacity":"0x460913c00"},{"lock":{"codeHash":"0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248","hashType":"type","args":"0x0300000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5"},"type":{"codeHash":"0x685a60219309029d01310311dba953d67029170ca4848a4ff638e57002130a0d","hashType":"data1","args":"0x8c72c7831de29dd1a4d95b2b187cf4a6d22536d75492f6b3ea8261f35aee2682"},"capacity":"0x466871d00"},{"lock":{"codeHash":"0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8","hashType":"type","args":"0x75178f34549c5fe9cd1a0c57aebd01e7ddf9249e"},"capacity":"0x1b3fb2fe87e3"}],"outputsData":["0x3e00000010000000200000003e0000000c000000436c7573746572206e616d651a0000004465736372697074696f6e206f662074686520636c7573746572","0x2d000000100000001e0000002d0000000a000000746578742f706c61696e0b00000046697273742053706f7265","0x2e000000100000001e0000002e0000000a000000746578742f706c61696e0c0000005365636f6e642053706f7265","0x"],"witnesses":["0x","0x","0x","0x","0x","0x"]}`,
    );

    const clusterCell: IndexerCell = {
      blockNumber: '0x0',
      outPoint: {
        txHash: '0xf0c18d9511cb7cd64901c7b7eff7e3e9ba0ec51a21b2c5d3c8edba938ef43b07',
        index: '0x0',
      },
      output: {
        ...ckbTx.outputs[0],
        lock: {
          codeHash: '0x61ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c3248',
          hashType: 'type',
          args: '0x010000004442ba224799de3cc23590789bb180a43f676a07699e43fae0f7d815876d17f7',
        },
      },
      outputData:
        '0x3e00000010000000200000003e0000000c000000436c7573746572206e616d651a0000004465736372697074696f6e206f662074686520636c7573746572',
      txIndex: '0x0',
    };

    const cobuild = generateSporeCreateCoBuild({
      clusterCell,
      clusterOutputCell: ckbTx.outputs[0],
      sporeOutputs: ckbTx.outputs.slice(1, 3),
      sporeOutputsData: ckbTx.outputsData.slice(1, 3),
    });
    expect(cobuild).toBe(
      '0x010000ff740300000c000000100000000000000064030000080000005c030000100000005201000057020000420100001000000030000000500000008b478561829d384ac1832a78bbb62b9b8d64a4f8970b0d4cd1eaa6f7d8738638552ea5a271a96cd8442d7501f05ffbe07bcc1033982e7a369bfd38b9cc1060baee00000004000000ea00000010000000300000008d000000bc5168a4f90116fada921e185d4b018e784dc0f6266e539a3c092321c932700a000000005900000010000000300000003100000061ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c32480124000000010000004442ba224799de3cc23590789bb180a43f676a07699e43fae0f7d815876d17f7000000005900000010000000300000003100000061ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c324801240000000100000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d505010000100000003000000050000000aad7f6a215b3b115dcf4a5c595b05aac12013adf97278d163cc4bb9a7987414a7d70430a5c4be5955b954abb394afb745a9027ba931dab9575ef45f3303947c7b100000000000000ad00000010000000300000008d000000205fe15af04e59d3ff1ff8e0b0a1e3bc201af406a38964760c24848ed6029b6b000000005900000010000000300000003100000061ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c324801240000000200000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5659c98d1e69d14a7198f2d0ea589be71caa7d34d01de3ae9371d9fa81d8b693d05010000100000003000000050000000fd5cfb4595e35c17eb4a98f131e079c843b0a376f036b3fbf962f1198c4769f6dd7b9800ec88fe828c6a8e91773d0214df9b1880ece3abded2f4cab584bb775db100000000000000ad00000010000000300000008d0000008c72c7831de29dd1a4d95b2b187cf4a6d22536d75492f6b3ea8261f35aee2682000000005900000010000000300000003100000061ca7a4796a4eb19ca4f0d065cb9b10ddcf002f10f7cbb810c706cb6bb5c324801240000000300000050b34b391fd8f8084bf9b6af4368350c1510df4964496b87495ebee4bd8d86d5ec2e91d4fb973de32f149fe5070422b86c2f8408e481cacc54e9a967b01d08dd',
    );
  });
});
