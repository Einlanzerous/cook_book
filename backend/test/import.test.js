/**
 * COOK-6 criterion 7 (import route) and the parser half of criterion 12.
 * axios is mocked with a saved HTML fixture: no network.
 */
import fs from 'node:fs';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
import axios from 'axios';
import { parseHelloFreshUrl } from '../src/services/helloFreshParser.js';
import { describeDb, createScratchDb } from './helpers/db.js';
import { createTestApp, authed } from './helpers/auth.js';

const html = fs.readFileSync(new URL('./fixtures/hellofresh-recipe.html', import.meta.url), 'utf8');
const ldPage = (obj) =>
  `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', ...obj })}</script></head></html>`;
const serve = (body) => axios.get.mockResolvedValue({ data: body });
const URL_ = 'https://www.hellofresh.com/recipes/synthetic-bibimbap';

describe('HelloFresh parser tags (criterion 12)', () => {
  beforeEach(() => axios.get.mockReset());

  it('puts total time, category and cuisine in fields, not tags; estimates and flags the split', async () => {
    serve(html);
    const r = await parseHelloFreshUrl(URL_);
    expect(r).toMatchObject({
      totalMinutes: 30, prepTime: 10, cookTime: 20, timeSplitEstimated: true,
      category: 'Main Course', cuisine: 'Korean', vegetarian: false
    });
    expect(r.tags).toEqual(['Beef']);
    expect(r.tags.join(' ')).not.toMatch(/Minutes|Hour|Korean|Main Course|Vegetarian/);
  });

  it('a page with its own prep and cook is not flagged as estimated', async () => {
    serve(ldPage({ name: 'Soup', prepTime: 'PT5M', cookTime: 'PT10M', totalTime: 'PT15M', recipeIngredient: [] }));
    const r = await parseHelloFreshUrl(URL_);
    expect(r).toMatchObject({ prepTime: 5, cookTime: 10, totalMinutes: 15, timeSplitEstimated: false });
  });

  it('vegetarian comes from the title heuristic; no Vegetarian tag', async () => {
    serve(ldPage({ name: 'Veggie Stir Fry Bowl', recipeIngredient: [] }));
    const r = await parseHelloFreshUrl(URL_);
    expect(r.vegetarian).toBe(true);
    expect(r.tags).toEqual(['Bowl']);
    expect(r.cuisine).toBe('Asian'); // style tag moved to the column
  });

  it('style tags Mexican/Asian are cuisine, not tags; a page cuisine wins', async () => {
    serve(ldPage({ name: 'Beef Tacos', recipeIngredient: [] }));
    let r = await parseHelloFreshUrl(URL_);
    expect(r.cuisine).toBe('Mexican');
    expect(r.tags).toEqual(['Beef']);
    serve(ldPage({ name: 'Beef Tacos', recipeCuisine: 'tex-mex', recipeIngredient: [] }));
    r = await parseHelloFreshUrl(URL_);
    expect(r.cuisine).toBe('Tex-mex');
  });

  it('HTML fallback path (no JSON-LD, nulls for cuisine/category/time) emits no such tags', async () => {
    serve('<html><head><meta name="description" content="d"></head><body><h1>Chicken Teriyaki Salad</h1></body></html>');
    const r = await parseHelloFreshUrl(URL_);
    expect(r).toMatchObject({
      totalMinutes: null, timeSplitEstimated: false, category: null, cuisine: 'Asian', vegetarian: false
    });
    expect(r.tags.sort()).toEqual(['Chicken', 'Salad']);
  });
});

describeDb('POST /api/import/hellofresh (criterion 7)', () => {
  let db;
  let app;
  let me;
  beforeAll(async () => {
    db = await createScratchDb();
    const t = await createTestApp(db.prisma);
    app = t.app;
    await db.prisma.contributor.findFirst({ where: { name: 'magos' } }).then((m) => db.prisma.contributor.update({ where: { id: m.id }, data: { email: 'magos@example.com' } }));
    const cookie = await t.signIn('magos@example.com');
    me = () => authed(app, cookie);
  });
  afterAll(async () => { await db?.drop(); });
  beforeEach(async () => {
    axios.get.mockReset();
    await db.prisma.recipe.deleteMany();
  });

  it('creates a recipe end to end from the saved fixture', async () => {
    serve(html);
    const res = await me().post('/api/import/hellofresh').send({ url: URL_ }).expect(201);
    const r = res.body;
    expect(axios.get).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({
      title: 'Beef & Zucchini Bibimbap',
      source: 'HelloFresh',            // ruling 15
      sourceLabel: 'HelloFresh',
      sourceUrl: URL_,
      totalMinutes: 30,
      prepTime: 10,
      cookTime: 20,
      timeSplitEstimated: true,
      category: 'Main Course',
      cuisine: 'Korean',
      vegetarian: false,
      servings: 2
    });
    expect(r.contributor.name).toBe('magos');   // the signed-in caller
    expect(r.directions.map((d) => d.instruction)).toEqual(['Cook the rice.', 'Brown the beef.']);
    expect(r.tags.map((t) => t.name)).toEqual(['Beef']);
    const rice = r.ingredients.find((i) => /Jasmine/i.test(i.name));
    expect(rice.quantity).toBe(2);
    const salt = r.ingredients.find((i) => /Salt/i.test(i.name));
    expect(salt.quantity).toBeNull();
  });

  it('COOK-27: prod-pattern page stores corrected amount/unit/name/quantity and clean directions', async () => {
    serve(fs.readFileSync(new URL('./fixtures/hellofresh-prod-patterns.html', import.meta.url), 'utf8'));
    const r = (await me().post('/api/import/hellofresh').send({ url: URL_ }).expect(201)).body;
    const by = (n) => r.ingredients.find((i) => i.name === n);
    expect(by('Israeli Couscous')).toMatchObject({ amount: '1/2', unit: 'cup', quantity: 0.5 });
    expect(by('Jasmine Rice')).toMatchObject({ amount: '3/4', unit: 'cup', quantity: 0.75 });
    expect(by('Tomato Paste')).toMatchObject({ amount: '1.5', unit: 'ounce', quantity: 1.5 });
    expect(by('Ground Beef')).toMatchObject({ amount: '10', unit: 'ounce', quantity: 10 });
    expect(by('Ginger')).toMatchObject({ amount: '1', unit: 'thumb', quantity: 1 });
    expect(by('Cumin')).toMatchObject({ amount: null, unit: 'teaspoon', quantity: null });
    expect(by('Lemon')).toMatchObject({ amount: '2', unit: null, quantity: 2 });
    expect(by('Soy Sauce')).toMatchObject({ amount: '1 1/2', quantity: 1.5 });
    expect(by('Garlic')).toMatchObject({ amount: '2-3', quantity: null });
    expect(by('Salt')).toMatchObject({ amount: null, unit: null, quantity: null });
    expect(r.ingredients.some((i) => /^[/.\d]/.test(i.name))).toBe(false);
    expect(r.directions).toHaveLength(3);
    expect(r.directions.map((d) => d.instruction).join('')).not.toMatch(/[•\n]/);
  });

  it('a veggie title sets vegetarian', async () => {
    serve(ldPage({ name: 'Veggie Burrito Bowl', totalTime: 'PT25M', recipeIngredient: ['1 cup Rice'], recipeInstructions: ['Cook.'] }));
    const r = (await me().post('/api/import/hellofresh').send({ url: URL_ }).expect(201)).body;
    expect(r.vegetarian).toBe(true);
    expect(r.cuisine).toBe('Mexican');
    expect(r.totalMinutes).toBe(25);
  });

  it('rejects non-HelloFresh urls and a missing url', async () => {
    await me().post('/api/import/hellofresh').send({}).expect(400);
    await me().post('/api/import/hellofresh').send({ url: 'https://example.com/x' }).expect(400);
    // Hostname is checked, not a substring: these all contain 'hellofresh.com'.
    for (const bad of [
      'http://169.254.169.254/latest/meta-data/?x=hellofresh.com',
      'https://hellofresh.com.attacker.example/recipes/x',
      'https://nothellofresh.com/recipes/x',
      'file:///etc/passwd#hellofresh.com',
      { toString: () => 'https://www.hellofresh.com/x' },
    ]) {
      await me().post('/api/import/hellofresh').send({ url: bad }).expect(400);
    }
  });
});
