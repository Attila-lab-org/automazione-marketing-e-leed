import { describe, expect, it } from 'vitest';
import { buildCityBoard } from '@/lib/campaigns/city-board';

describe('quadro campagna per città', () => {
  it('conta uscite, senza risposta e pronte, e riconosce una zona già cercata', () => {
    const board = buildCityBoard({
      contacts: [
        { id: '1', city: 'Milano', email: 'a@milano.it', sent: true, replied: false, ready: false },
        { id: '2', city: 'Milano', email: null, sent: false, replied: false, ready: true },
        { id: '3', city: 'Lecce', email: 'b@lecce.it', sent: true, replied: true, ready: false },
        { id: '4', city: 'Lecce', email: 'c@lecce.it', sent: false, replied: false, ready: true },
      ],
      searchedLocations: ['Milano Navigli', 'Lecce'],
    });

    const milano = board.rows.find((row) => row.city === 'Milano');
    const lecce = board.rows.find((row) => row.city === 'Lecce');
    expect(milano).toMatchObject({
      contacts: 2,
      withEmail: 1,
      sent: 1,
      noReply: 1,
      replied: 0,
      ready: 1,
      searched: true,
    });
    expect(lecce).toMatchObject({ sent: 1, noReply: 0, replied: 1, ready: 1, searched: true });
    expect(board.totals).toMatchObject({ sent: 2, noReply: 1, replied: 1, ready: 2 });
  });
});
