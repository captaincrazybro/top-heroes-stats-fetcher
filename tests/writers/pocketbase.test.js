const PocketBase = require('pocketbase');
const pbWriter = require('../../src/writers/pocketbase');

const mock = PocketBase._mockCollection;

const baseRecord = {
  rank: 1, player_name: 'Alpha', guild_tag: 'WAR', server: '#10607',
  score: 5000, event_type: 'GAR', event_start_date: '2026-06-01',
  captured_at: '2026-06-08T02:50:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mock.getList.mockResolvedValue({ totalItems: 0, items: [] });
  pbWriter._resetClient(); // ensure cached PocketBase client is reset between tests
});

describe('pbWriter.write for GAR', () => {
  test('INSERTs each record', async () => {
    await pbWriter.write([baseRecord], 'GAR');
    expect(mock.create).toHaveBeenCalledTimes(1);
    expect(mock.create).toHaveBeenCalledWith(baseRecord);
  });

  test('INSERTs multiple records', async () => {
    const r2 = { ...baseRecord, player_name: 'Beta' };
    await pbWriter.write([baseRecord, r2], 'GAR');
    expect(mock.create).toHaveBeenCalledTimes(2);
  });
});

describe('pbWriter.write for KvK', () => {
  test('INSERTs each record', async () => {
    const kvkRecord = { ...baseRecord, event_type: 'KvK' };
    await pbWriter.write([kvkRecord], 'KvK');
    expect(mock.create).toHaveBeenCalledWith(kvkRecord);
  });
});

describe('pbWriter.write for GR', () => {
  test('UPSERTs: calls update() when existing record found', async () => {
    mock.getList.mockResolvedValue({ totalItems: 1, items: [{ id: 'existing-id' }] });
    const grRecord = { ...baseRecord, event_type: 'GR' };

    await pbWriter.write([grRecord], 'GR');

    expect(mock.update).toHaveBeenCalledWith('existing-id', grRecord);
    expect(mock.create).not.toHaveBeenCalled();
  });

  test('UPSERTs: calls create() when no existing record found', async () => {
    mock.getList.mockResolvedValue({ totalItems: 0, items: [] });
    const grRecord = { ...baseRecord, event_type: 'GR' };

    await pbWriter.write([grRecord], 'GR');

    expect(mock.create).toHaveBeenCalledWith(grRecord);
    expect(mock.update).not.toHaveBeenCalled();
  });
});
