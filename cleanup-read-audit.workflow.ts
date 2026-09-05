import {
  workflow,
  node,
  trigger,
  newCredential,
} from '@n8n/workflow-sdk';

const manual = trigger({
  type: 'n8n-nodes-base.manualTrigger',
  version: 1,
  config: { name: 'Start' },
});

const deleteTestRow = node({
  type: 'n8n-nodes-base.googleSheets',
  version: 4.7,
  config: {
    name: 'Delete Test Row',
    parameters: {
      resource: 'sheet',
      operation: 'delete',
      documentId: { __rl: true, mode: 'list', value: '15GQ9lqhThV_K_me86N0lYefDhETL-a2cn_XJVtktuIk', cachedResultName: 'razorpay' },
      sheetName: { __rl: true, mode: 'list', value: '243634607', cachedResultName: 'audit_log' },
      toDelete: 'rows',
      startIndex: 8,
      numberToDelete: 1,
    },
    credentials: {
      googleSheetsOAuth2Api: newCredential('Google Sheets account', 'MhXToMVb1X0s07z9'),
    },
  },
});

export default workflow('cleanup-read-audit', 'Cleanup — Delete Test Row')
  .add(manual)
  .to(deleteTestRow);
