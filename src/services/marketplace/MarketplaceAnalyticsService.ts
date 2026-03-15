import { admin } from '../../index';

export interface MarketplaceStats {
  workerCount: number;
  ownerCount: number;
  jobCount: number;
  activeProjectCount: number;
  totalVolume: number;
  trendingSkills: { skill: string; count: number }[];
  supplyDemandRatio: number;
}

export class MarketplaceAnalyticsService {
  private get db() { return admin.firestore(); }

  async getGlobalStats(): Promise<MarketplaceStats> {
    const workers = await this.db.collection('users').where('role', '==', 'worker').count().get();
    const owners = await this.db.collection('users').where('role', '==', 'owner').count().get();
    const jobs = await this.db.collection('jobs').count().get();
    const activeProjects = await this.db.collection('projects').where('status', '==', 'active').count().get();

    // Trending skills (based on job tags)
    const recentJobs = await this.db.collection('jobs')
      .orderBy('createdAt', 'desc')
      .limit(100)
      .get();

    const skillMap = new Map<string, number>();
    recentJobs.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      const skills = doc.data().skills || [];
      skills.forEach((skill: string) => {
        skillMap.set(skill, (skillMap.get(skill) || 0) + 1);
      });
    });

    const trendingSkills = Array.from(skillMap.entries())
      .map(([skill, count]) => ({ skill, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const workerCount = workers.data().count;
    const ownerCount = owners.data().count;
    
    return {
      workerCount,
      ownerCount,
      jobCount: jobs.data().count,
      activeProjectCount: activeProjects.data().count,
      totalVolume: 0, // Placeholder
      trendingSkills,
      supplyDemandRatio: ownerCount > 0 ? workerCount / ownerCount : 0
    };
  }

  async getGeographicalData() {
    const users = await this.db.collection('users').limit(1000).get();
    const geoMap = new Map<string, number>();
    
    users.docs.forEach((doc: admin.firestore.QueryDocumentSnapshot) => {
      const location = doc.data().location?.country || 'Unknown';
      geoMap.set(location, (geoMap.get(location) || 0) + 1);
    });

    return Array.from(geoMap.entries()).map(([country, count]) => ({ country, count }));
  }
}

export const marketplaceAnalytics = new MarketplaceAnalyticsService();
