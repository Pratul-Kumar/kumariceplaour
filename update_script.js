const fs = require('fs');
let code = fs.readFileSync('src/pages/StaffProfile.tsx', 'utf8');

code = code.replace(
  'generateSalarySlip(staff, record, recordPayments, { workingDays: w, presentDays: p, absentDays: a, leaveDays: 0, halfDays: h }, selectedPaymentId);',
  'const ledgerEntries = await ledgerService.getByStaff(staff.id!); generateSalarySlip(staff, record, recordPayments, { workingDays: w, presentDays: p, absentDays: a, leaveDays: 0, halfDays: h }, ledgerEntries, selectedPaymentId);'
);

code = code.replace(
  'const [genRecoveryOption, setGenRecoveryOption] = useState<"full" | "partial" | "skip">("full");\r\n  const [genRecoveryAmount, setGenRecoveryAmount] = useState("0");',
  `const [genAddDue, setGenAddDue] = useState(false);\n  const [genAddDueAmount, setGenAddDueAmount] = useState("0");\n  const [genDeductAdvance, setGenDeductAdvance] = useState(false);\n  const [genDeductAdvanceAmount, setGenDeductAdvanceAmount] = useState("0");`
).replace(
  'const [genRecoveryOption, setGenRecoveryOption] = useState<"full" | "partial" | "skip">("full");\n  const [genRecoveryAmount, setGenRecoveryAmount] = useState("0");',
  `const [genAddDue, setGenAddDue] = useState(false);\n  const [genAddDueAmount, setGenAddDueAmount] = useState("0");\n  const [genDeductAdvance, setGenDeductAdvance] = useState(false);\n  const [genDeductAdvanceAmount, setGenDeductAdvanceAmount] = useState("0");`
);

code = code.replace(
  'const [existingRecord, setExistingRecord] = useState<SalaryRecord | null>(null);',
  'const [existingRecord, setExistingRecord] = useState<SalaryRecord | null>(null);\n  const [lastUnpaidDue, setLastUnpaidDue] = useState(0);'
);

code = code.replace(
  'const prevDue = lastUnpaid?.remainingDue || 0;\n        const outstandingBalance = staff.outstandingBalance || 0;',
  'const prevDue = lastUnpaid?.remainingDue || 0;\n        const outstandingBalance = staff.outstandingBalance || 0;\n        if (active) setLastUnpaidDue(prevDue);'
).replace(
  'const prevDue = lastUnpaid?.remainingDue || 0;\r\n        const outstandingBalance = staff.outstandingBalance || 0;',
  'const prevDue = lastUnpaid?.remainingDue || 0;\n        const outstandingBalance = staff.outstandingBalance || 0;\n        if (active) setLastUnpaidDue(prevDue);'
);

// We use start/end markers to replace the preview block
const pStart = '        let requestedAdvance = 0;';
const pEnd = 'setPreviewIsCapped(isCapped);';
if (code.includes(pStart) && code.includes(pEnd)) {
  const p1 = code.substring(0, code.indexOf(pStart));
  const p2 = code.substring(code.indexOf(pEnd) + pEnd.length);
  const newBlock = `        const appliedDue = genAddDue ? (Number(genAddDueAmount) || 0) : 0;
        const requestedAdvance = genDeductAdvance ? (Number(genDeductAdvanceAmount) || 0) : 0;
        
        const maxRecoverable = Math.max(0, earningsCalc.finalSalary + appliedDue);
        const actualDeductedAdvance = Math.min(requestedAdvance, maxRecoverable);
        
        const result = calculateSalary({
          staff,
          attendanceRecords: attRecords,
          workingDaysInMonth: daysInMonth,
          bonus: Number(genBonus) || 0,
          advance: actualDeductedAdvance,
          extraDeduction: Number(genExtra) || 0,
        });

        const totalPayable = result.finalSalary + appliedDue;

        if (active) {
          setPreviewCalc(result);
          setPreviewDue(appliedDue);
          setPreviewActualDeduct(actualDeductedAdvance);
          setPreviewRollover(0);
          setPreviewIsCapped(false);`;
  code = p1 + newBlock + p2;
}

const sStart = '      const previousDue = lastUnpaid?.remainingDue || 0;\r\n      const outstandingBalance = staff.outstandingBalance || 0;';
const sStart2 = '      const previousDue = lastUnpaid?.remainingDue || 0;\n      const outstandingBalance = staff.outstandingBalance || 0;';
const sEnd = '      const totalPayable = calc.finalSalary + previousDue;';

let splitP1, splitP2;
if (code.includes(sStart)) {
  splitP1 = code.substring(0, code.indexOf(sStart));
  splitP2 = code.substring(code.indexOf(sEnd) + sEnd.length);
} else if (code.includes(sStart2)) {
  splitP1 = code.substring(0, code.indexOf(sStart2));
  splitP2 = code.substring(code.indexOf(sEnd) + sEnd.length);
}

if (splitP1 && splitP2) {
  const newSubmit = `      const appliedDue = genAddDue ? (Number(genAddDueAmount) || 0) : 0;
      const outstandingBalance = Math.max(0, staff.outstandingBalance || 0);

      const calc = calculateSalary({
        staff,
        attendanceRecords: attRecordsCount,
        workingDaysInMonth: daysInMonth,
        bonus: Number(genBonus) || 0,
        advance: previewActualDeduct,
        extraDeduction: Number(genExtra) || 0,
      });

      const totalPayable = calc.finalSalary + appliedDue;`;
  code = splitP1 + newSubmit + splitP2;
}

code = code.replace(
  '        previousDue,',
  '        previousDue: appliedDue,'
);

const jsxStart = '{/* Advance recovery configuration (Only shown if ledger debt > 0) */}';
const jsxEnd = '{/* Payout/Payment Configuration */}';
if (code.includes(jsxStart) && code.includes(jsxEnd)) {
  const jsx1 = code.substring(0, code.indexOf(jsxStart));
  const jsx2 = code.substring(code.indexOf(jsxEnd));
  const newJsx = `{/* PREVIOUS DUE SECTION */}
            {(lastUnpaidDue > 0 || genAddDue) && (
              <div className="col-span-2 p-3.5 bg-blue-500/5 rounded-xl border border-glass-border space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Previous Due</span>
                  <Badge variant="success" className="font-extrabold text-xs">
                    Available: ₹{lastUnpaidDue}
                  </Badge>
                </div>
                
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="addDue"
                    checked={genAddDue}
                    onChange={(e) => {
                      setGenAddDue(e.target.checked);
                      if (e.target.checked) setGenAddDueAmount(String(lastUnpaidDue));
                    }}
                    className="rounded border-border"
                  />
                  <label htmlFor="addDue" className="text-sm font-medium">Add Due to Salary</label>
                </div>

                {genAddDue && (
                  <div className="pt-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Add Amount (₹)</label>
                    <Input
                      type="number"
                      min={0}
                      max={lastUnpaidDue}
                      value={genAddDueAmount}
                      onChange={(e) => setGenAddDueAmount(e.target.value)}
                      placeholder="Enter amount..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* ADVANCE DEDUCTION SECTION */}
            {outstanding > 0 && (
              <div className="col-span-2 p-3.5 bg-indigo-500/5 rounded-xl border border-glass-border space-y-2.5">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Advance Deduction</span>
                  <Badge variant="destructive" className="font-extrabold text-xs">
                    Available: ₹{outstanding}
                  </Badge>
                </div>
                
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="checkbox"
                    id="deductAdv"
                    checked={genDeductAdvance}
                    onChange={(e) => {
                      setGenDeductAdvance(e.target.checked);
                      if (e.target.checked) setGenDeductAdvanceAmount(String(outstanding));
                    }}
                    className="rounded border-border"
                  />
                  <label htmlFor="deductAdv" className="text-sm font-medium">Deduct Advance</label>
                </div>

                {genDeductAdvance && (
                  <div className="pt-1.5">
                    <label className="text-xs font-semibold text-muted-foreground block mb-1">Deduct Amount (₹)</label>
                    <Input
                      type="number"
                      min={0}
                      max={outstanding}
                      value={genDeductAdvanceAmount}
                      onChange={(e) => setGenDeductAdvanceAmount(e.target.value)}
                      placeholder="Enter amount..."
                    />
                  </div>
                )}
              </div>
            )}

            {/* FINAL SUMMARY SECTION */}
            {previewCalc && (
              <div className="col-span-2 p-4 bg-muted/50 rounded-xl border border-border space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Generated Salary</span>
                  <span className="font-medium">₹{previewCalc.finalSalary + previewActualDeduct}</span>
                </div>
                {genAddDue && previewDue > 0 && (
                  <div className="flex justify-between text-emerald-500">
                    <span>Added Due</span>
                    <span>+₹{previewDue}</span>
                  </div>
                )}
                {genDeductAdvance && previewActualDeduct > 0 && (
                  <div className="flex justify-between text-red-500">
                    <span>Advance Deduction</span>
                    <span>-₹{previewActualDeduct}</span>
                  </div>
                )}
                <div className="border-t border-border pt-2 flex justify-between font-bold text-base">
                  <span>Final Payable</span>
                  <span>₹{previewCalc.finalSalary + previewDue}</span>
                </div>
              </div>
            )}

            `;
  code = jsx1 + newJsx + jsx2;
}

code = code.replace(
  'setGenBonus("0");\n      setGenExtra("0");', 
  'setGenBonus("0");\n      setGenExtra("0");\n      setGenAddDue(false);\n      setGenDeductAdvance(false);'
).replace(
  'setGenBonus("0");\r\n      setGenExtra("0");', 
  'setGenBonus("0");\n      setGenExtra("0");\n      setGenAddDue(false);\n      setGenDeductAdvance(false);'
);

fs.writeFileSync('src/pages/StaffProfile.tsx', code);
console.log('Update complete');
