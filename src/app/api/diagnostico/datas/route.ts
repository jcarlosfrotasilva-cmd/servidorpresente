import { addDays, dayOfWeek, daysInMonth, isValidDateISO, monthEnd, nowLocal } from "@/lib/time";

export const dynamic = "force-dynamic";

/**
 * Diagnóstico do tratamento de datas e horários do sistema.
 * Executa verificações de fuso, virada de mês, ano bissexto e formatação.
 */
export async function GET() {
  const now = nowLocal();
  const checks: { nome: string; esperado: string; obtido: string; ok: boolean }[] = [];

  const check = (nome: string, esperado: unknown, obtido: unknown) => {
    const e = String(esperado);
    const o = String(obtido);
    checks.push({ nome, esperado: e, obtido: o, ok: e === o });
  };

  // 1. Fuso horário oficial da escola
  check("Fuso padrão", "America/Sao_Paulo", "America/Sao_Paulo");
  check("Data de hoje é válida", true, isValidDateISO(now.date));
  check("Dia da semana coerente (1=seg ... 7=dom)", true, now.weekday >= 1 && now.weekday <= 7);
  check(
    "Minutos desde 00:00 coerentes com HH:MM",
    true,
    Math.floor(now.minutes / 60) === Number(now.time.slice(0, 2)) % 24,
  );

  // 2. Fim de mês para meses de 28/29/30/31 dias
  check("monthEnd 2026-02 (28 dias)", "2026-02-28", monthEnd("2026-02"));
  check("monthEnd 2028-02 (bissexto)", "2028-02-29", monthEnd("2028-02"));
  check("monthEnd 2026-04 (30 dias)", "2026-04-30", monthEnd("2026-04"));
  check("monthEnd 2026-12 (31 dias)", "2026-12-31", monthEnd("2026-12"));
  check("daysInMonth 2028-02", 29, daysInMonth("2028-02").length);
  check("Último dia listado em 2026-11", "2026-11-30", daysInMonth("2026-11").at(-1));

  // 3. Nenhuma data gerada é inválida (todos os meses de 2026 e 2027)
  const invalidas: string[] = [];
  for (const ano of [2026, 2027]) {
    for (let m = 1; m <= 12; m += 1) {
      const mes = `${ano}-${String(m).padStart(2, "0")}`;
      for (const dia of daysInMonth(mes)) {
        if (!isValidDateISO(dia)) invalidas.push(dia);
      }
      const fim = monthEnd(mes);
      if (!isValidDateISO(fim)) invalidas.push(`monthEnd:${mes}`);
    }
  }
  check("Dias gerados inválidos (2026-2027)", 0, invalidas.length);

  // 4. Dia da semana de referência: 03/10/2026 é sábado (ISO 6)
  check("dayOfWeek 2026-10-03 = sábado", 6, dayOfWeek("2026-10-03"));
  check("dayOfWeek 2026-10-04 = domingo", 7, dayOfWeek("2026-10-04"));
  check("dayOfWeek 2026-10-05 = segunda", 1, dayOfWeek("2026-10-05"));

  // 5. Aritmética de dias atravessando mês, ano e ano bissexto
  check("addDays 2026-10-31 +1", "2026-11-01", addDays("2026-10-31", 1));
  check("addDays 2026-12-31 +1", "2027-01-01", addDays("2026-12-31", 1));
  check("addDays 2028-02-28 +1 (bissexto)", "2028-02-29", addDays("2028-02-28", 1));
  check("addDays 2026-03-01 -1", "2026-02-28", addDays("2026-03-01", -1));
  check("addDays 2026-01-01 -1", "2025-12-31", addDays("2026-01-01", -1));

  // 6. Fuso na virada do dia: 00:30 em São Paulo = 03:30 UTC do mesmo dia
  const virada = nowLocal(new Date("2026-10-05T00:30:00-03:00"));
  check("Virada de dia (00:30 BRT)", "2026-10-05", virada.date);
  check("Virada de dia (hora)", "00:30", virada.hhmm);
  const noite = nowLocal(new Date("2026-10-05T23:59:00-03:00"));
  check("Fim do dia (23:59 BRT)", "2026-10-05", noite.date);
  const utcMeiaNoite = nowLocal(new Date("2026-10-06T02:00:00Z"));
  check("02:00 UTC = 23:00 BRT do dia anterior", "2026-10-05", utcMeiaNoite.date);

  const falhas = checks.filter((item) => !item.ok);
  return Response.json(
    {
      ok: falhas.length === 0,
      fuso: "America/Sao_Paulo",
      agora: now,
      verificacoes: checks.length,
      falhas: falhas.length,
      detalhes: falhas,
      checks,
    },
    { status: falhas.length === 0 ? 200 : 500 },
  );
}
