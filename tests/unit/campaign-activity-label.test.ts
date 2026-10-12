import { describe, expect, it } from 'vitest';
import { campaignActivityLabel, emptyCampaignProgress } from '@/lib/campaigns/activity-label';

describe('etichetta campagna', () => {
  it('non chiama invio in corso una campagna che sta solo preparando le demo', () => {
    expect(
      campaignActivityLabel('ACTIVE', 17, { ...emptyCampaignProgress(), pending: 7, skipped: 10 }),
    ).toBe('Sto ancora scrivendo le email');
  });

  it('dice invio in corso solo quando ci sono attività già approvate', () => {
    expect(
      campaignActivityLabel('ACTIVE', 7, { ...emptyCampaignProgress(), approved: 7 }),
    ).toBe('Le email stanno uscendo');
  });

  it('spiega quando nessuna attività è compatibile', () => {
    expect(
      campaignActivityLabel('ACTIVE', 10, { ...emptyCampaignProgress(), skipped: 10 }),
    ).toBe('Nessuna attività può ricevere questa email');
  });
});
