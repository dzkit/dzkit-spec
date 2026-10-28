# Operations

What every dzkit implementation must do, in any language. The rules in `rules/` give the **data**; this page gives the **behaviour**: which inputs are accepted, what comes out, what is rejected and what is an error. The test cases in `vectors/` check every point below, one file per operation.

Function names are each implementation's choice (`calculateIrg` in JavaScript, `calculate_irg` in Python); the operation names here are the shared ones. Every implementation provides **all** of them; [PORTING.md](PORTING.md) explains how to start one.

| Area | Operations |
|---|---|
| RIP and CCP | `rip.validate`, `rip.from-ccp`, `rip.format`, `ccp.validate` |
| Phone numbers | `phone.parse`, `phone.validate`, `phone.format` |
| Licence plates | `plate.parse`, `plate.format` |
| NIF and NIS | `nif.validate`, `nis.validate` |
| Wilayas | `wilaya.lookup` |
| Payroll | `irg.calculate`, `irg.breakdown`, `salary.gross-to-net`, `salary.net-to-gross` |
| Words | `words.number-fr`, `words.amount-fr`, `words.number-ar`, `words.amount-ar` |

## 1. General rules

### 1.1 Rejected or error?

There are two ways to say no, and every implementation uses them the same way:

| Situation | Result | In the test cases |
|---|---|---|
| The input is not a valid value of that kind: wrong format, wrong key, unknown code, wrong type, empty, missing | **Rejected**: the parser returns its "nothing" value (`null`, `None`), the validator returns `false`. Never an exception. | `"expected": null` |
| The request itself is impossible: a negative or non-finite amount, an amount too large, an unknown option value, a date no rule version covers | **Error**: the function raises or throws, with the code below. | `"error": "<code>"` |

Validators and parsers are called with whatever a form or a file contains, so they must accept any value without failing. Calculations are called by code, so an impossible request is a programming error and must not produce a number.

| Error code | Meaning |
|---|---|
| `invalid-amount` | Amount is negative, not a finite number, or larger than the operation supports |
| `invalid-option` | An option has a value outside its list (for example an unknown IRG regime) |
| `no-rule-for-date` | No version of the rule covers the requested date |

How the code is carried is up to each language (an error class, an exception code, an error field), but it must be readable by the caller.

### 1.2 Cleaning text input

Before parsing any identifier (phone number, plate, RIP, CCP account, NIF, NIS, wilaya code given as text), an implementation:

1. converts **Arabic-Indic digits** `٠١٢٣٤٥٦٧٨٩` (U+0660–U+0669) and **Eastern Arabic-Indic digits** `۰۱۲۳۴۵۶۷۸۹` (U+06F0–U+06F9) to `0123456789`;
2. trims whitespace at both ends; "whitespace" is any Unicode space, including the no-break space (U+00A0) and the narrow no-break space (U+202F) that word processors insert.

Each operation then lists the separators it ignores. Anything else makes the input rejected.

### 1.3 Amounts and rounding

- Amounts are in dinars (DA), with at most two decimals that matter (centimes).
- **Rounding to the centime is half up, on the amount as written in decimal.** `1.005` → 1 DA 1 centime, `2.675` → 2 DA 68 centimes, `1.004` → 1 DA. Languages with binary floating point must not multiply by 100 and round, because `1.005 × 100` is `100.49999…` in binary; they round the shortest decimal representation of the number instead, or use a decimal type.
- Calculations are done exactly (decimal or rational arithmetic, or with care for floating-point error), and rounded only where this page says so.

### 1.4 Dates

Operations whose rule changes over time take an optional **date** (ISO `YYYY-MM-DD`), the day the result is for: the day a salary relates to, the day a plate is checked. Without a date, the implementation uses today in Algeria (UTC+1).

To apply a rule on a date, use the version whose `valid_from`…`valid_to` range contains it (both inclusive). `valid_from: null` means the version applies to every earlier date. If no version covers the date, the result is the error `no-rule-for-date`, except for validators and parsers, where it is a rejection.

Some data entries carry their own `valid_from` (the wilayas created in 2019 and 2026). On a date before an entry's `valid_from`, that entry doesn't exist.

## 2. Identifiers

### `rip.validate` — RIP (relevé d'identité postale)

- **Input:** `rip`, any value.
- **Ignored separators:** whitespace, `.`, `-`, `_`, `/`.
- **Accepted:** exactly 20 digits, starting with bank code `007` and branch code `99999`, whose last two digits are the RIP key of the 10-digit account (rule `banking.ccp-rip`).
- **Output:** `valid: true`, `account` (10 digits), `key` (2 digits).
- **Rejected:** anything else.

### `rip.from-ccp` — RIP from a CCP account

- **Input:** `account`, 1 to 10 digits, as text or as a non-negative integer.
- **Ignored separators:** as `rip.validate`.
- **Output:** `rip` (20 digits), `ccp_key` (2 digits), `rip_key` (2 digits). The account is left-padded with zeros to 10 digits.
- **Rejected:** empty, more than 10 digits, anything that isn't digits after cleaning.

### `rip.format` — RIP in four groups

- **Input:** `rip`, any value, accepted as by `rip.validate`.
- **Output:** `text`, the four groups separated by single spaces: `007 99999 0023115007 97`.
- **Rejected:** anything `rip.validate` rejects, including a RIP with a wrong key. Only valid RIPs are formatted.

### `ccp.validate` — CCP account with its key

- **Input:** `account`, as `rip.from-ccp`; `key`, 1 or 2 digits as text (cleaned as § 1.2) or a non-negative integer.
- **Output:** `valid`: `true` when the key equals the CCP key of the account (rule `banking.ccp-rip`, `ccp_key`), comparing both on 2 digits (`4` is `04`). Never `null`: anything invalid is `valid: false`.

### `phone.parse` — phone number

- **Input:** `number`, any value.
- **Ignored separators:** whitespace, `.`, `-`, `(`, `)`, `/`.
- **Accepted forms** (after cleaning), where `N` is the national number without its leading 0:
  - `0N` — national;
  - `+213N`, `00213N` — international;
  - `213N` — international without `+`, only when the whole is 11 or 12 digits;
  - `+2130N`, `002130N` — international with the national 0 kept by mistake.
- **Types** (rule `telecom.phone`): `N` must have the length and first digit of one type; otherwise rejected.
- **Output:** `type`, `national` (`0N`), `e164` (`+213N`); mobiles add `operator` and `allocated`; service numbers add `allocated` and `freephone`; VoIP adds `allocated`; landlines add `area_code` (first two digits of `N`).
- **Allocation never rejects.** A number in a block ARPCE hasn't assigned yet is accepted with `allocated: false`, because ARPCE assigns new blocks over time.

### `phone.validate` — is it a phone number?

- **Input:** `number`, any value; `type`, optional, one of `mobile`, `landline`, `service`, `voip`; `allocated_only`, optional, default `false`.
- **Output:** `valid`: `true` when `phone.parse` accepts the number, its type matches `type` (when given), and, when `allocated_only` is true, the number isn't marked `allocated: false`. Landlines carry no allocation, so `allocated_only` doesn't affect them.
- **Error:** `invalid-option` for an unknown `type`.

### `phone.format` — formatted phone number

- **Input:** `number`, any value, accepted as by `phone.parse`; `style`, `national` (default) or `international`.
- **Output:** `text`, with `N` the national number without its 0:
  - landlines: national `0` + area code, then the six remaining digits in pairs: `021 23 45 67`; international `+213 21 23 45 67`;
  - every other type: national `0` + first three digits of `N`, then pairs: `0551 23 45 67`, `0800 12 34 56`; international `+213 551 23 45 67`.
- **Rejected:** anything `phone.parse` rejects.
- **Error:** `invalid-option` for an unknown `style`.

### `plate.parse` — licence plate

- **Input:** `plate`, any value; `date`, optional (§ 1.4).
- **Accepted forms** (after § 1.2):
  - separated: `SERIAL C YY WW`, the three groups separated by one or more spaces or dashes, with `SERIAL` 1 to 6 digits and `CYY` 3 digits — `02639-126-09`, `12345 119 16`;
  - compact: when the separated form doesn't match, remove all whitespace; 10 or 11 digits are read as a 5- or 6-digit serial followed by `CYYWW` — `1234511916`, `12345 11916`.
- **Rejected:** serial of only zeros, category 0, wilaya code not issued on plates on that date (rule `vehicles.plates`, `wilaya_codes`), any other shape. Plate validation never raises `no-rule-for-date`; a date before every version is a rejection.
- **Output:** `serial` (as written, without padding), `category` (1–9), `category_name` (the French name from rule `vehicles.plates`, `categories`), `year` (2 digits, as written), `wilaya` (code).

### `plate.format` — formatted plate

- **Input:** as `plate.parse`.
- **Output:** `text`: `SERIAL-CYY-WW`, the serial left-padded with zeros to `serial.display_digits` (5) when shorter, the wilaya on 2 digits: `02639-126-09`, `00007-126-31`, `123456-126-09`.
- **Rejected:** anything `plate.parse` rejects on that date.

### `nif.validate` and `nis.validate` — tax and statistical numbers

- **Input:** `value`, any value.
- **Ignored separators:** whitespace, `.`, `-`.
- **Accepted:** digits only, with one of the lengths of rules `business.nif` and `business.nis`.
- **Output:** `valid` (`true` or `false`). These operations never reject with `null`: an invalid value is `valid: false`.

### `wilaya.lookup` — wilaya by code

- **Input:** `code`, an integer, or text of 1 to 3 digits after § 1.2 (leading zeros allowed: `"09"`, `"016"`); `date`, optional (§ 1.4).
- **Rejected:** zero, a code above the last wilaya, a code whose wilaya doesn't exist yet on that date, a non-integer number, text with anything other than digits (`"16a"`, `"1e1"`, `"16.0"`, `" 1 6"`).
- **Output:** `name_fr`, `name_ar`; for wilayas created after 1984, also `parent` (the code it was created from) and `valid_from`.

## 3. Payroll

### `irg.calculate` — monthly IRG on a salary or pension

- **Input:** `taxable` (monthly taxable income in DA: gross minus the employee's social security contribution), `regime` (one of the keys of `regimes` in rule `payroll.irg-salary`; default `salaried`), `date` (optional).
- **Steps:** as described in rule `payroll.irg-salary`, applied to `taxable` as given, with one rounding inside: the result of the progressive scale (`scale_irg`) is rounded half up to the centime before the abatements. The final result is rounded down to `rounding.step` (0.1 DA).
- **Errors:** `invalid-amount` (negative, not finite, not a number), `invalid-option` (unknown regime), `no-rule-for-date`.
- **Output:** `irg`.

### `irg.breakdown` — every step of the IRG, for payslips

- **Input and errors:** as `irg.calculate`.
- **Output:**
  - `scale_irg`: the result of the progressive scale, rounded half up to the centime (step 2 of the rule);
  - `exempt`: `true` when taxable income is at or below the exemption threshold; then `abatement`, `smoothing` and `irg` are 0;
  - `abatement`: the 40 % abatement after its bounds, rounded half up to the centime;
  - `smoothing`: the second abatement, that is the IRG after the first abatement minus the result of the smoothing formula, before the final rounding, rounded half up to the centime; 0 when no smoothing formula applies;
  - `irg`: as `irg.calculate`.

  The lines don't always add up to the centime, because the IRG is rounded down to 0.1 DA at the end.

### `salary.gross-to-net` — regular monthly salary

- **Input:** `gross` (DA), `regime` (as `irg.calculate`), `date` (optional).
- **Steps** (rules `payroll.cnas` and `payroll.irg-salary` in force on the date):
  1. `cnas_employee` = gross × employee rate, rounded half up to the centime;
  2. `taxable` = gross − cnas_employee;
  3. `irg` = `irg.calculate` on `taxable`;
  4. `net` = taxable − irg;
  5. `cnas_employer` = gross × (employer rate + social services rate), rounded half up to the centime.
- **Errors:** as `irg.calculate`.
- **Output:** `cnas_employee`, `taxable`, `irg`, `net`, `cnas_employer`.

### `salary.net-to-gross` — gross salary for a target net

- **Input:** `net` (target net salary in DA), `regime`, `date` (optional), as `salary.gross-to-net`.
- **Output:** the **smallest gross, in whole centimes**, whose net (by `salary.gross-to-net`) is at least the target, with all the fields of `salary.gross-to-net` plus `gross`. A target of 0 gives a gross of 0.
- **Careful:** net pay doesn't always increase with gross. It dips by up to about 1.5 DA where taxable income passes 30 000 DA, because the law's smoothing formula starts at about 1.5 DA of IRG, and by up to 0.1 DA elsewhere, because the IRG is rounded down to 0.1 DA. A plain bisection can return a gross that works but isn't the smallest; implementations must also check below it.
- **Errors:** as `salary.gross-to-net`.

Not covered: non-monthly bonuses (10 % flat withholding), exempt allowances, the minimum-wage floor of the contribution base, training and apprenticeship taxes.

## 4. Words

### `words.number-fr` and `words.number-ar` — whole number in words

- **Input:** `number`, an integer from 0 to 999 999 999 999 (just under 1 000 billion).
- **Errors:** `invalid-amount` for a negative, non-integer, non-finite or larger number.
- **Output:** `text`. Spelling rules are in rule `language.amount-in-words`.

### `words.amount-fr` and `words.amount-ar` — DZD amount in words

- **Input:** `amount` in DA, from 0 to 999 999 999 999.99, rounded to the centime (§ 1.3).
- **Errors:** `invalid-amount` for a negative, non-finite or larger amount.
- **Output:** `text`: the dinars, then the centimes when there are any. Zero dinars is written (`zéro dinar algérien et cinquante centimes`, `صفر دينار جزائري وخمسون سنتيما`).

## 5. Changing this page

This page is part of the contract. A change that makes an existing test case give a different result is a breaking change for every implementation and follows the versioning rules in [GOVERNANCE.md](GOVERNANCE.md). Add test cases for every point you add or change.
