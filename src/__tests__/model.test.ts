import { resolveModel } from '../model';

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: (id: number) => ({
      downloadAsync: async () => ({ localUri: id === 7 ? 'file:///cache/heavy.task' : null }),
    }),
  },
}));

describe('resolveModel', () => {
  it('passes names and uris through', async () => {
    expect(await resolveModel(undefined)).toBeUndefined();
    expect(await resolveModel('full')).toBe('full');
    expect(await resolveModel({ uri: 'file:///x.task' })).toBe('file:///x.task');
  });

  it('copies bundled assets to a local file', async () => {
    expect(await resolveModel(7)).toBe('file:///cache/heavy.task');
    await expect(resolveModel(8)).rejects.toMatchObject({ code: 'MODEL_LOAD_FAILED' });
  });
});
