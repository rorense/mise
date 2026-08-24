import {
  convertIngredientAmount,
  convertMeasurementsInText,
  roundCulinary,
} from '@/lib/import/units';

describe('convertIngredientAmount', () => {
  it('leaves metric and kitchen units alone', () => {
    expect(convertIngredientAmount(250, 'g')).toEqual({ quantity: 250, unit: 'g' });
    expect(convertIngredientAmount(2, 'cups')).toEqual({
      quantity: 2,
      unit: 'cups',
    });
    expect(convertIngredientAmount(1.5, 'tsp')).toEqual({
      quantity: 1.5,
      unit: 'tsp',
    });
  });

  it('leaves countables alone', () => {
    expect(convertIngredientAmount(3, null)).toEqual({ quantity: 3, unit: null });
  });

  it('converts weight to grams', () => {
    expect(convertIngredientAmount(8, 'oz')).toEqual({ quantity: 225, unit: 'g' });
    expect(convertIngredientAmount(1, 'lb')).toEqual({ quantity: 455, unit: 'g' });
    expect(convertIngredientAmount(1, 'ounce')).toEqual({ quantity: 28, unit: 'g' });
  });

  it('converts liquid volume to millilitres', () => {
    expect(convertIngredientAmount(1, 'fl oz')).toEqual({ quantity: 30, unit: 'ml' });
    expect(convertIngredientAmount(1, 'pint')).toEqual({ quantity: 475, unit: 'ml' });
    expect(convertIngredientAmount(1, 'quart')).toEqual({ quantity: 945, unit: 'ml' });
  });

  it('reads fl oz as volume rather than as ounces', () => {
    expect(convertIngredientAmount(4, 'fl oz').unit).toBe('ml');
    expect(convertIngredientAmount(4, 'oz').unit).toBe('g');
  });

  it('is case and spacing insensitive', () => {
    expect(convertIngredientAmount(2, ' LB ')).toEqual({ quantity: 905, unit: 'g' });
    expect(convertIngredientAmount(1, 'Fl. Oz.')).toEqual({
      quantity: 30,
      unit: 'ml',
    });
  });

  it('leaves "stick" countable so cinnamon sticks do not become 227 g', () => {
    expect(convertIngredientAmount(2, null)).toEqual({ quantity: 2, unit: null });
    expect(convertIngredientAmount(2, 'stick')).toEqual({
      quantity: 2,
      unit: 'stick',
    });
  });
});

describe('roundCulinary', () => {
  it('rounds to amounts a cook can actually measure', () => {
    expect(roundCulinary(226.796)).toBe(225);
    expect(roundCulinary(28.3495)).toBe(28);
    expect(roundCulinary(2.3)).toBe(2.5);
    expect(roundCulinary(0.42)).toBe(0.4);
  });
});

describe('convertMeasurementsInText', () => {
  it('converts oven temperatures', () => {
    expect(convertMeasurementsInText('Preheat the oven to 350°F.')).toBe(
      'Preheat the oven to 175°C.'
    );
    expect(convertMeasurementsInText('Bake at 400 degrees F until golden.')).toBe(
      'Bake at 205°C until golden.'
    );
    expect(convertMeasurementsInText('Heat to 425 Fahrenheit.')).toBe(
      'Heat to 220°C.'
    );
  });

  it('does not double up when the source already gave celsius', () => {
    expect(convertMeasurementsInText('Bake at 350°F (175°C) for an hour.')).toBe(
      'Bake at 175°C for an hour.'
    );
  });

  it('leaves small numbers alone rather than treating them as fahrenheit', () => {
    const text = 'Add 2 F-grade eggs.';
    expect(convertMeasurementsInText(text)).toBe(text);
  });

  it('converts tin and dice sizes to centimetres', () => {
    expect(convertMeasurementsInText('Use a 9-inch springform tin.')).toBe(
      'Use a 23 cm springform tin.'
    );
    expect(convertMeasurementsInText('Cut into 1/2 inch dice.')).toBe(
      'Cut into 1.5 cm dice.'
    );
    expect(convertMeasurementsInText('Roll out to 8".')).toBe('Roll out to 20 cm.');
  });

  it('leaves already-metric text untouched', () => {
    const text = 'Bake at 180°C in a 23 cm tin for 45 minutes.';
    expect(convertMeasurementsInText(text)).toBe(text);
  });

  it('does not damage a scaling placeholder', () => {
    const text = 'Add {{qty_1}} g flour and bake at 350°F.';
    expect(convertMeasurementsInText(text)).toBe(
      'Add {{qty_1}} g flour and bake at 175°C.'
    );
  });
});
