export interface ParsedStickerData {
  mrn?: string;
  name?: string;
  dob?: string; // Standardized to DD/MM/YYYY
  medicareNo?: string;
  confidence: 'HIGH' | 'PROBABLE' | 'MANUAL_REVIEW';
  matchReason?: string;
  rawText: string;
  barcodeValue?: string;
}

/**
 * Standardize 2-digit or 4-digit years into DD/MM/YYYY
 */
export function normalizeDobString(dateStr: string): string | undefined {
  if (!dateStr) return undefined;

  // Handle textual month e.g. "30 Jan 1953"
  const textMonthMatch = dateStr.match(/^([0-9]{1,2})\s+([A-Za-z]{3,9})\s+([0-9]{4})$/);
  if (textMonthMatch) {
    const day = textMonthMatch[1].padStart(2, '0');
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthIndex = monthNames.findIndex(m => textMonthMatch[2].toLowerCase().startsWith(m));
    if (monthIndex !== -1) {
      const month = String(monthIndex + 1).padStart(2, '0');
      return `${day}/${month}/${textMonthMatch[3]}`;
    }
  }

  // Handle numeric e.g. 12/02/1963 or 30/05/83 or 19-05-78
  const parts = dateStr.split(/[\/\-\.]/);
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    let year = parts[2];

    if (year.length === 2) {
      const numYear = parseInt(year, 10);
      // Birth year heuristic: If > 26, it's 1900s, else 2000s
      year = numYear > 26 ? `19${year}` : `20${year}`;
    }

    if (parseInt(month, 10) >= 1 && parseInt(month, 10) <= 12 && parseInt(day, 10) >= 1 && parseInt(day, 10) <= 31) {
      return `${day}/${month}/${year}`;
    }
  }

  return undefined;
}

/**
 * Clean and format name into standard 'SURNAME, Given Names'
 */
function cleanTitle(str: string): string {
  return str.replace(/\b(MR|MRS|MS|MISS|DR|PROF|A-PROF|MSTER)\b/gi, '').trim();
}

function formatProperCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/(?:^|\s|-|')[a-z]/g, (c) => c.toUpperCase());
}

/**
 * Deterministically parse Australian hospital stickers (St Vincent's, Epworth, Hobson's Bay)
 */
export function parseStickerText(
  rawText: string,
  _hospital?: string,
  barcodeValue?: string
): ParsedStickerData {
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let mrn: string | undefined;
  let dob: string | undefined;
  let name: string | undefined;
  let medicareNo: string | undefined;

  // 1. BARCODE PRIORITY FOR MRN (100% Deterministic)
  if (barcodeValue) {
    const cleanBc = barcodeValue.trim();
    // Check if barcode is direct 6-8 digits
    const digitsOnly = cleanBc.match(/\b([0-9]{6,8})\b/);
    if (digitsOnly) {
      mrn = digitsOnly[1];
    } else {
      const epwBc = cleanBc.match(/EPW.*?([0-9]{6,8})/i);
      if (epwBc) {
        mrn = epwBc[1];
      }
    }
  }

  // 2. OCR EXTRACTION FOR MRN
  if (!mrn) {
    // Look for EPW UR: 2320677 or UR: 581670 or UR: 174079
    const urMatch = rawText.match(/(?:EPW\s+)?UR[:\s#]+([0-9]{6,8})/i);
    if (urMatch) {
      mrn = urMatch[1];
    } else {
      // Look for St Vincent's Public sticker format: 7 digits standing on its own on the top lines
      for (const line of lines.slice(0, 3)) {
        const lineMatch = line.match(/\b([0-9]{7})\b/);
        if (lineMatch && !line.includes('Adm') && !line.includes('MC:')) {
          mrn = lineMatch[1];
          break;
        }
      }
    }
  }

  // 3. OCR EXTRACTION FOR DOB
  // A. Labeled DOB: e.g. DOB: 12/02/1963, DOB:02/11/1974, DoB:27/07/1950, D.o.B.: 19/05/78, Date of Birth: 22/10/1994
  const labeledDob = rawText.match(/(?:DOB|DoB|D\.o\.B\.|Date of Birth)[:\s]*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.](?:19|20)?[0-9]{2})/i);
  if (labeledDob) {
    dob = normalizeDobString(labeledDob[1]);
  }

  // B. Textual Month e.g. "Date of Birth 30 Jan 1953"
  if (!dob) {
    const textualDob = rawText.match(/(?:Date of Birth|DOB)[:\s]*([0-9]{1,2}\s+[A-Za-z]{3,9}\s+[0-9]{4})/i);
    if (textualDob) {
      dob = normalizeDobString(textualDob[1]);
    }
  }

  // C. Hobson's Bay format: unlabeled date followed by age "( 42Y)" e.g. "30/05/83 ( 42Y)"
  if (!dob) {
    const ageFollowedDob = rawText.match(/\b([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})\s*(?:\(\s*[0-9]{1,2}Y?\s*\)|\(Age)/i);
    if (ageFollowedDob) {
      dob = normalizeDobString(ageFollowedDob[1]);
    }
  }

  // 4. OCR EXTRACTION FOR PATIENT NAME
  // Strategy A: Front Sheet format: "Surname: FERNANDO", "Firstname: KALUHANNDIGE"
  const surnameField = rawText.match(/Surname:\s*([A-Z\u00C0-\u017F\s\'-]+)/i);
  const firstnameField = rawText.match(/Firstname:\s*([A-Z\u00C0-\u017F\s\'-]+)/i);
  if (surnameField && firstnameField) {
    const sur = surnameField[1].split(/[\n\r]/)[0].trim();
    const first = cleanTitle(firstnameField[1].split(/[\n\r\/]/)[0].trim());
    name = `${sur.toUpperCase()}, ${formatProperCase(first)}`;
  }

  // Strategy B: Comma format: "CREMONA, MS DIJANA UR: 174079" or "Burne, Ms Tanya < >"
  if (!name) {
    const commaMatch = rawText.match(/([A-Z\u00C0-\u017F\s\'-]{2,25}),\s*(?:MR|MRS|MS|MISS|DR|PROF)?\s*([A-Z\u00C0-\u017F\s\'-]{2,25})/i);
    if (commaMatch) {
      const rawSurname = commaMatch[1].trim();
      // Ignore if captured hospital header or "Ref MIRZA"
      if (!rawSurname.includes('HOSP') && !rawSurname.includes('PATIENT') && !rawSurname.includes('REF')) {
        let cleanFirst = cleanTitle(commaMatch[2])
          .replace(/\b(UR|A)\b.*$/i, '')
          .replace(/[<>0-9]/g, '')
          .trim();
        if (cleanFirst.length >= 2) {
          name = `${rawSurname.toUpperCase()}, ${formatProperCase(cleanFirst)}`;
        }
      }
    }
  }

  // Strategy C: Multi-line St Vincent's format:
  // e.g. Line 1: "MARINIER DOB: 12/02/1963", Line 2: "MR GLEN ANTHONY Sex M/ Gender M"
  // or Line 1: "O’BRYAN", Line 2: "SUZANNE GAEL"
  if (!name) {
    for (let i = 0; i < lines.length - 1; i++) {
      const line1 = lines[i].trim();
      const line2 = lines[i + 1].trim();

      // Check if line 1 starts with a single uppercase surname word (allowing straight & curly apostrophes)
      const surMatch = line1.match(/^([A-Z\u00C0-\u017F\'’-]{3,20})(?:\s+DOB|\s+DoB|\s*$)/i);
      if (surMatch) {
        const candidateSur = surMatch[1].toUpperCase();
        if (!['ADM', 'HOSPITAL', 'PATIENT', 'DEMOGRAPHICS', 'STVINCENT', 'EPWORTH', 'HOBSONS'].includes(candidateSur)) {
          // Line 2 has title + given names, optionally followed by "Sex", "PMI", etc.
          let cleanGiven = cleanTitle(line2)
            .split(/\b(Sex|Gender|PMI|DOB|DoB)\b/i)[0]
            .replace(/[^A-Za-z\s\'’-]/g, '')
            .trim();

          if (cleanGiven.length >= 2) {
            name = `${candidateSur}, ${formatProperCase(cleanGiven)}`;
            break;
          }
        }
      }
    }
  }

  // Strategy D: Title + Given + Surname e.g. "Mr Clinton HAYDEN"
  if (!name) {
    const titleGivenSur = rawText.match(/(?:Mr|Mrs|Ms|Miss|Dr)\s+([A-Za-z]+)\s+([A-Z]{2,20})/);
    if (titleGivenSur) {
      name = `${titleGivenSur[2].toUpperCase()}, ${formatProperCase(titleGivenSur[1])}`;
    }
  }

  // Strategy E: "LAU Mr Chin Man" on single line
  if (!name) {
    const surTitleGiven = rawText.match(/([A-Z]{2,20})\s+(?:Mr|Mrs|Ms|Miss|Dr)\s+([A-Za-z\s]{3,25})/);
    if (surTitleGiven) {
      const givenSingleLine = surTitleGiven[2].split(/[\r\n]/)[0].trim();
      name = `${surTitleGiven[1].toUpperCase()}, ${formatProperCase(givenSingleLine)}`;
    }
  }

  // 5. MEDICARE EXTRACTION (Australian cards: 10 or 11 digits, plus optional slash/space and IRN)
  const mcMatch = rawText.match(/(?:M\/Care|MC|Medicare No)[:\s]*([0-9]{10,11}(?:\s*[\/\-]\s*[0-9])?)/i);
  if (mcMatch) {
    medicareNo = mcMatch[1].replace(/\s+/g, ' ').trim();
  }

  // 6. CONFIDENCE & STATUS CALCULATION
  let confidence: ParsedStickerData['confidence'] = 'MANUAL_REVIEW';
  let matchReason = '';

  if (mrn) {
    confidence = 'HIGH';
    matchReason = barcodeValue ? 'MRN decoded from barcode (100% Deterministic)' : 'MRN extracted from sticker OCR';
  } else if (name && dob) {
    confidence = 'PROBABLE';
    matchReason = 'MRN unreadable; matched by Name and DOB';
  } else {
    confidence = 'MANUAL_REVIEW';
    matchReason = 'Missing MRN and complete demographic details. Review required.';
  }

  return {
    mrn,
    name,
    dob,
    medicareNo,
    confidence,
    matchReason,
    rawText,
    barcodeValue,
  };
}
