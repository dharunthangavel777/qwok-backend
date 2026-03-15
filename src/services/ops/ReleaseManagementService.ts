import { admin } from '../../index';

export class ReleaseManagementService {
  private db = admin.firestore();

  async getReleaseConfig() {
    const doc = await this.db.collection('system_config').doc('release_management').get();
    return doc.exists ? doc.data() : {
      minAppVersion: '1.0.0',
      featureFlags: {}
    };
  }

  async updateFeatureFlag(flag: string, enabled: boolean) {
    await this.db.collection('system_config').doc('release_management').set({
      featureFlags: { [flag]: enabled }
    }, { merge: true });
  }

  async setMinVersion(version: string) {
    await this.db.collection('system_config').doc('release_management').update({
      minAppVersion: version
    });
  }
}

export const releaseManagementService = new ReleaseManagementService();
