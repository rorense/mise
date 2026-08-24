/**
 * Imperial to metric conversion, done here rather than by the model.
 *
 * The extraction prompt used to say "convert non-metric units to metric in the
 * numbers you output", which asked the model to do unverifiable arithmetic in
 * the middle of a transcription task — exactly the kind of silent step that
 * saves a recipe with a wrong number in it. The model now reports the source's
 * own unit and every conversion happens here, where it is a table lookup with a
 * test around it.
 */

/** Units the app's scaling and display code already understands. */
const CONVERSIONS: { aliases: string[]; factor: number; unit: string }[] = [
  // Longest aliases first: "fl oz" must win before "oz" gets a look.
  {
    aliases: ['fl oz', 'fl. oz', 'fl. oz.', 'floz', 'fluid ounce', 'fluid ounces'],
    factor: 29.5735,
    unit: 'ml',
  },
  { aliases: ['oz', 'oz.', 'ounce', 'ounces'], factor: 28.3495, unit: 'g' },
  { aliases: ['lb', 'lb.', 'lbs', 'lbs.', 'pound', 'pounds'], factor: 453.592, unit: 'g' },
  { aliases: ['pt', 'pint', 'pints'], factor: 473.176, unit: 'ml' },
  { aliases: ['qt', 'quart', 'quarts'], factor: 946.353, unit: 'ml' },
  { aliases: ['gal', 'gallon', 'gallons'], factor: 3785.41, unit: 'ml' },
];

/**
 * "Stick" is deliberately absent. A stick of butter is 113 g but a cinnamon
 * stick, a celery stick and a stick of lemongrass are not — converting on the
 * unit alone would turn "2 cinnamon sticks" into 227 g of cinnamon. The
 * extraction prompt states the butter figure instead, where the ingredient
 * name is in view.
 */

function normalizeUnitToken(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Kitchen-scale rounding. 28.3495 g of butter is not a thing anyone weighs, and
 * a long decimal in an ingredient row reads like a bug.
 */
export function roundCulinary(value: number): number {
  const abs = Math.abs(value);
  if (abs >= 100) return Math.round(value / 5) * 5;
  if (abs >= 10) return Math.round(value);
  if (abs >= 1) return Math.round(value * 2) / 2;
  return Math.round(value * 10) / 10;
}

export type ConvertedAmount = { quantity: number; unit: string | null };

/**
 * Converts one ingredient amount to metric, or returns it untouched when the
 * unit is already something the app handles (g, ml, cup, tsp, tbsp, pinch, or
 * no unit at all for countables like eggs).
 */
export function convertIngredientAmount(
  quantity: number,
  unit: string | null
): ConvertedAmount {
  if (!unit) return { quantity, unit };
  const token = normalizeUnitToken(unit);
  if (!token) return { quantity, unit: null };
  const match = CONVERSIONS.find((entry) => entry.aliases.includes(token));
  if (!match) return { quantity, unit };
  return {
    quantity: roundCulinary(quantity * match.factor),
    unit: match.unit,
  };
}

/** Oven temperatures below this are almost certainly not Fahrenheit. */
const MIN_FAHRENHEIT = 90;

// A trailing "(180 C)" is captured so an already-converted source does not end
// up as "175°C (180°C)".
const FAHRENHEIT_RE =
  /(\d{2,3})\s*(?:°\s*|\s*degrees?\s+)?F(?:ahrenheit)?\b(\s*\(\s*\d{2,3}\s*(?:°\s*)?C(?:elsius)?\s*\))?/gi;

const INCH_RE =
  /(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*-?\s*(?:inch(?:es)?\b|in\.|")(\s*\(\s*\d+(?:\.\d+)?\s*cm\s*\))?/gi;

function parseNumeric(raw: string): number | null {
  const value = raw.trim();
  const mixed = value.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator === 0) return null;
    return Number(mixed[1]) + Number(mixed[2]) / denominator;
  }
  const fraction = value.match(/^(\d+)\/(\d+)$/);
  if (fraction) {
    const denominator = Number(fraction[2]);
    if (denominator === 0) return null;
    return Number(fraction[1]) / denominator;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Rewrites Fahrenheit temperatures and inch measurements inside step text.
 *
 * Step instructions are prose, so this runs on whatever the model transcribed
 * rather than on a structured field. It is conservative on purpose: a number
 * under 90 is not treated as Fahrenheit, and a measurement that already carries
 * a metric equivalent in brackets is replaced rather than doubled up.
 */
export function convertMeasurementsInText(text: string): string {
  const withCelsius = text.replace(FAHRENHEIT_RE, (whole, degrees: string) => {
    const fahrenheit = Number(degrees);
    if (!Number.isFinite(fahrenheit) || fahrenheit < MIN_FAHRENHEIT) return whole;
    const celsius = Math.round((((fahrenheit - 32) * 5) / 9) / 5) * 5;
    return `${celsius}°C`;
  });
  return withCelsius.replace(INCH_RE, (whole, amount: string) => {
    const inches = parseNumeric(amount);
    if (inches === null || inches <= 0) return whole;
    const cm = inches * 2.54;
    const rounded = cm >= 5 ? Math.round(cm) : Math.round(cm * 2) / 2;
    return `${rounded} cm`;
  });
}
