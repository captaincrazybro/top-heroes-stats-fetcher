const mockCreate = jest.fn();

const Anthropic = jest.fn().mockImplementation(() => ({
  messages: { create: mockCreate },
}));

Anthropic._mockCreate = mockCreate;
module.exports = Anthropic;
