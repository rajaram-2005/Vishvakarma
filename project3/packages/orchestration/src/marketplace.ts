// §104 / §105 / §106 — Marketplace Trust, Verified Publishers and Community
// Reporting. Ranking considers security, maintenance, compatibility, quality,
// reviews, usage and license — not downloads alone.

export type PublisherState = 'verified' | 'community' | 'unverified' | 'restricted';

export interface Publisher {
  id: string;
  state: PublisherState;
  reputation: number; // 0..1
}

export interface PackageListing {
  id: string;
  publisher: string;
  security: number; // 0..1
  maintenance: number; // 0..1
  compatibility: number; // 0..1
  quality: number; // 0..1
  reviews: number;
  usage: number;
  licenseOk: boolean;
}

export interface Report {
  id: string;
  listing: string;
  reason: 'malware' | 'bad-plugin' | 'broken-model' | 'license' | 'misleading' | 'security';
  by: string;
}

export class Marketplace {
  private publishers = new Map<string, Publisher>();
  listings = new Map<string, PackageListing>();
  private reports: Report[] = [];

  addPublisher(p: Publisher): void {
    this.publishers.set(p.id, p);
  }

  addListing(l: PackageListing): void {
    this.listings.set(l.id, l);
  }

  /** Weighted trust score (§104). Downloads/usage is only one factor. */
  trustScore(l: PackageListing): number {
    const pub = this.publishers.get(l.publisher);
    const pubFactor = pub ? pub.reputation * (pub.state === 'verified' ? 1 : 0.6) : 0.3;
    const score =
      0.25 * l.security +
      0.15 * l.maintenance +
      0.15 * l.compatibility +
      0.15 * l.quality +
      0.1 * Math.min(1, l.reviews / 100) +
      0.1 * Math.min(1, l.usage / 1000) +
      0.1 * pubFactor;
    return l.licenseOk ? score : score * 0.3;
  }

  ranked(): PackageListing[] {
    return [...this.listings.values()].sort((a, b) => this.trustScore(b) - this.trustScore(a));
  }

  report(r: Report): void {
    this.reports.push(r);
    const l = this.listings.get(r.listing);
    if (l && (r.reason === 'malware' || r.reason === 'security')) {
      // Demote immediately on serious reports.
      l.security = Math.min(l.security, 0.2);
    }
  }

  openReports(): Report[] {
    return this.reports;
  }
}
