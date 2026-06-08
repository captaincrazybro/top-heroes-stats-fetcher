// tests/__mocks__/pocketbase.js
const mockCollection = {
  authWithPassword: jest.fn().mockResolvedValue({}),
  create: jest.fn().mockResolvedValue({ id: 'new-id' }),
  update: jest.fn().mockResolvedValue({ id: 'updated-id' }),
  getList: jest.fn().mockResolvedValue({ totalItems: 0, items: [] }),
};

const PocketBase = jest.fn().mockImplementation(() => ({
  admins: { authWithPassword: jest.fn().mockResolvedValue({}) },
  collection: jest.fn().mockReturnValue(mockCollection),
}));

PocketBase._mockCollection = mockCollection;
module.exports = PocketBase;
