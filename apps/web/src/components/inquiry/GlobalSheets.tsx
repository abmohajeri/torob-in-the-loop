import { AskSheet } from './AskSheet.js';
import { AlternativesSheet } from '../alternatives/AlternativesSheet.js';

/** App-wide sheets owned by the inquiry/alternatives flows (mounted once in AppShell). */
export function GlobalSheets() {
  return (
    <>
      <AskSheet />
      <AlternativesSheet />
    </>
  );
}
