/* eslint-disable import/first -- jest.mock is hoisted above imports, so the
   mock function it closes over has to be declared before them. */
const mockManipulateAsync = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (...args: unknown[]) => mockManipulateAsync(...args),
  SaveFormat: { JPEG: 'jpeg' },
}));

import { prepareScanImage, SCAN_LONG_EDGE } from '@/lib/import/scanImage';

type Action = { resize?: { width?: number; height?: number } };

/** First call measures, second call resizes and returns base64. */
function stubMeasure(width: number, height: number, base64 = 'AAAA') {
  mockManipulateAsync.mockReset();
  mockManipulateAsync
    .mockResolvedValueOnce({ uri: 'file://measured.jpg', width, height })
    .mockResolvedValueOnce({ uri: 'file://out.jpg', width, height, base64 });
}

function resizeActions(): Action[] {
  return mockManipulateAsync.mock.calls[1][1] as Action[];
}

describe('prepareScanImage', () => {
  it('constrains the long edge of a portrait page by height', async () => {
    stubMeasure(3000, 4000);
    await prepareScanImage('file://page.jpg');
    expect(resizeActions()).toEqual([{ resize: { height: SCAN_LONG_EDGE } }]);
  });

  it('constrains the long edge of a landscape page by width', async () => {
    stubMeasure(4000, 3000);
    await prepareScanImage('file://spread.jpg');
    expect(resizeActions()).toEqual([{ resize: { width: SCAN_LONG_EDGE } }]);
  });

  it('treats a square photo as landscape rather than skipping the resize', async () => {
    stubMeasure(3000, 3000);
    await prepareScanImage('file://square.jpg');
    expect(resizeActions()).toEqual([{ resize: { width: SCAN_LONG_EDGE } }]);
  });

  it('never upscales a photo that is already small', async () => {
    stubMeasure(800, 1000);
    await prepareScanImage('file://small.jpg');
    expect(resizeActions()).toEqual([]);
  });

  it('asks for base64 and returns it as JPEG', async () => {
    stubMeasure(3000, 4000, 'BASE64DATA');
    const result = await prepareScanImage('file://page.jpg');

    expect(mockManipulateAsync.mock.calls[1][2]).toMatchObject({
      base64: true,
      format: 'jpeg',
    });
    expect(result).toEqual({ base64: 'BASE64DATA', mediaType: 'image/jpeg' });
  });

  it('fails loudly when the manipulator returns no base64', async () => {
    mockManipulateAsync.mockReset();
    mockManipulateAsync
      .mockResolvedValueOnce({ uri: 'file://m.jpg', width: 3000, height: 4000 })
      .mockResolvedValueOnce({ uri: 'file://o.jpg', width: 1650, height: 2200 });

    await expect(prepareScanImage('file://page.jpg')).rejects.toThrow(
      'Could not read that photo'
    );
  });
});

describe('prepareScanImage with known dimensions', () => {
  it('skips the measuring pass when ImagePicker already reported the size', async () => {
    mockManipulateAsync.mockReset();
    mockManipulateAsync.mockResolvedValueOnce({
      uri: 'file://out.jpg',
      width: 1650,
      height: 2200,
      base64: 'DATA',
    });

    const result = await prepareScanImage('file://page.jpg', {
      width: 3000,
      height: 4000,
    });

    // One call, not two: no decode-and-re-encode just to read two numbers.
    expect(mockManipulateAsync).toHaveBeenCalledTimes(1);
    expect(mockManipulateAsync.mock.calls[0][0]).toBe('file://page.jpg');
    expect(mockManipulateAsync.mock.calls[0][1]).toEqual([
      { resize: { height: SCAN_LONG_EDGE } },
    ]);
    expect(result.base64).toBe('DATA');
  });
});
