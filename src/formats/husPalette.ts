/**
 * Husqvarna HUS 29-thread palette.
 * Values from pyembroidery (MIT License, Copyright (c) 2018 Tatarize).
 */
import type { PaletteThread } from './util';
import { hexToRgb } from './util';

export const HUS_PALETTE: ReadonlyArray<PaletteThread> = [
  { name: 'Black', hex: '#000000', code: '026' },
  { name: 'Blue', hex: '#0000E7', code: '005' },
  { name: 'Green', hex: '#00C600', code: '002' },
  { name: 'Red', hex: '#FF0000', code: '014' },
  { name: 'Purple', hex: '#840084', code: '008' },
  { name: 'Yellow', hex: '#FFFF00', code: '020' },
  { name: 'Grey', hex: '#848484', code: '024' },
  { name: 'Light Blue', hex: '#8484E7', code: '006' },
  { name: 'Light Green', hex: '#00FF84', code: '003' },
  { name: 'Orange', hex: '#FF7B31', code: '017' },
  { name: 'Pink', hex: '#FF8CA5', code: '011' },
  { name: 'Brown', hex: '#845200', code: '028' },
  { name: 'White', hex: '#FFFFFF', code: '022' },
  { name: 'Dark Blue', hex: '#000084', code: '004' },
  { name: 'Dark Green', hex: '#008400', code: '001' },
  { name: 'Dark Red', hex: '#7B0000', code: '013' },
  { name: 'Light Red', hex: '#FF6384', code: '015' },
  { name: 'Dark Purple', hex: '#522952', code: '007' },
  { name: 'Light Purple', hex: '#FF00FF', code: '009' },
  { name: 'Dark Yellow', hex: '#FFDE00', code: '019' },
  { name: 'Light Yellow', hex: '#FFFF9C', code: '021' },
  { name: 'Dark Grey', hex: '#525252', code: '025' },
  { name: 'Light Grey', hex: '#D6D6D6', code: '023' },
  { name: 'Dark Orange', hex: '#FF5208', code: '016' },
  { name: 'Light Orange', hex: '#FF9C5A', code: '018' },
  { name: 'Dark Pink', hex: '#FF52B5', code: '010' },
  { name: 'Light Pink', hex: '#FFC6DE', code: '012' },
  { name: 'Dark Brown', hex: '#523100', code: '027' },
  { name: 'Light Brown', hex: '#B5A584', code: '029' },
];

export const HUS_RGB: ReadonlyArray<number | null> = HUS_PALETTE.map((t) => hexToRgb(t.hex));
