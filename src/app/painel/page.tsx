import { and, asc, eq } from "drizzle-orm";
import { PunchClock, type RegistroDia } from "@/app/painel/punch-clock";
import { db } from "@/db";
import { employeeSchedules, timeEntries, workSchedules } from "@/db/schema";
import { absencesOnDate, buildBlockInfo, loadActiveAbsences, loadHolidayByDate, loadHolidays } from "@/lib/calendar";
import { buildMonthlyReport } from "@/lib/reports";
import { getConfiguracao } from "@/lib/config";
import {
  buildWeek,
  dayExpectedMinutes,
  dayLabel,
  expectedSequence,
  isWorkDay,
  punchWindow,
  weekSummary,
  weekToList,
} from "@/lib/schedule";
import { requireServidor } from "@/lib/session";
import { addDays, currentMonth, dayOfWeek, nowLocal } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { title: "Registrar ponto" };

export default async function PainelPage() {
  const user = await requireServidor();
  const employeeId = user.employeeId as number;
  const hoje = nowLocal().date;
  const month = currentMonth();

  const agora = nowLocal();
  const [jornadaRows, horarioRows, registrosRows, feriado, ausenciasMap, feriadosProximos, config] =
    await Promise.all([
    user.jornadaId
      ? db.select().from(workSchedules).where(eq(workSchedules.id, user.jornadaId)).limit(1)
      : Promise.resolve([]),
    db
      .select({
        diaSemana: employeeSchedules.diaSemana,
        trabalha: employeeSchedules.trabalha,
        entrada: employeeSchedules.entrada,
        saidaAlmoco: employeeSchedules.saidaAlmoco,
        retornoAlmoco: employeeSchedules.retornoAlmoco,
        saidaExpediente: employeeSchedules.saidaExpediente,
        toleranciaMin: employeeSchedules.toleranciaMin,
      })
      .from(employeeSchedules)
      .where(eq(employeeSchedules.employeeId, employeeId)),
    db
      .select({ id: timeEntries.id, tipo: timeEntries.tipo, hora: timeEntries.hora })
      .from(timeEntries)
      .where(and(eq(timeEntries.employeeId, employeeId), eq(timeEntries.data, hoje)))
      .orderBy(asc(timeEntries.hora)),
    loadHolidayByDate(hoje),
    loadActiveAbsences([employeeId], hoje, addDays(hoje, 90)),
    loadHolidays(hoje, addDays(hoje, 180)),
    getConfiguracao(),
  ]);

  const week = buildWeek(horarioRows);
  const horarioHoje = week.get(dayOfWeek(hoje)) ?? null;
  const resumoSemana = weekSummary(week);
  const ausenciasDoServidor = ausenciasMap.get(employeeId) ?? [];
  const ausenciasHoje = absencesOnDate(ausenciasDoServidor, hoje);

  const bloqueioAusencia = buildBlockInfo({
    holiday: feriado,
    absences: ausenciasHoje,
    minutes: agora.minutes,
  });

  const trabalhaHoje = isWorkDay(horarioHoje);
  const janela = punchWindow(horarioHoje, config);
  const foraDaJanela = Boolean(
    trabalhaHoje &&
      janela &&
      config.bloquearForaDoHorario &&
      (agora.minutes < janela.abre || agora.minutes > janela.fecha),
  );

  // Regra: só é possível registrar ponto no dia e horário cadastrados.
  const bloqueio =
    bloqueioAusencia ??
    (!trabalhaHoje && config.bloquearForaDoHorario
      ? {
          tipo: "FORA_DO_HORARIO" as const,
          titulo: "Dia sem expediente cadastrado",
          descricao:
            "Não há horário de trabalho cadastrado para hoje. O registro de ponto é liberado apenas nos dias e horários definidos pela direção da escola.",
        }
      : foraDaJanela && janela
        ? {
            tipo: "FORA_DO_HORARIO" as const,
            titulo: "Fora do horário permitido",
            descricao: `A janela de registro para hoje é das ${janela.abreLabel} às ${janela.fechaLabel}${
              agora.minutes < janela.abre
                ? ". Aguarde o início do período liberado."
                : ". O período liberado já encerrou — procure a direção da escola."
            }`,
          }
        : null);

  const meses = [0, 1, 2].map((offset) => {
    const date = new Date(`${month}-01T12:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() - offset);
    return date.toISOString().slice(0, 7);
  });

  const reports = await Promise.all(meses.map((mes) => buildMonthlyReport(mes, [employeeId])));
  const atual = reports[0].rows[0];

  return (
    <PunchClock
      nome={user.employeeNome ?? user.nome}
      cargo={user.cargo}
      matricula={user.matricula}
      hoje={hoje}
      modeloNome={jornadaRows[0]?.nome ?? null}
      horarioHoje={horarioHoje}
      horarioLabel={dayLabel(horarioHoje)}
      trabalhaHoje={isWorkDay(horarioHoje)}
      previstoHoje={dayExpectedMinutes(horarioHoje)}
      esperadas={expectedSequence(horarioHoje)}
      janela={
        janela
          ? { abre: janela.abreLabel, fecha: janela.fechaLabel, bloquear: config.bloquearForaDoHorario }
          : null
      }
      semana={weekToList(week).map((dia) => ({
        diaSemana: dia.diaSemana,
        trabalha: isWorkDay(dia),
        label: dayLabel(dia),
        minutos: dayExpectedMinutes(dia),
        toleranciaMin: dia.toleranciaMin,
      }))}
      cargaSemanalMin={resumoSemana.minutos}
      bloqueio={bloqueio}
      feriado={
        feriado
          ? { nome: feriado.nome, tipo: feriado.tipo, bloqueiaPonto: feriado.bloqueiaPonto }
          : null
      }
      feriadosProximos={Array.from(feriadosProximos.values()).map((item) => ({
        data: item.data,
        nome: item.nome,
        tipo: item.tipo,
        bloqueiaPonto: item.bloqueiaPonto,
      }))}
      minhasAusencias={ausenciasDoServidor.slice(0, 8)}
      registrosIniciais={registrosRows as RegistroDia[]}
      resumo={{
        diasTrabalhados: atual?.diasTrabalhados ?? 0,
        diasFalta: atual?.diasFalta ?? 0,
        atrasos: atual?.atrasos ?? 0,
        totalMinutos: atual?.totalMinutos ?? 0,
        esperadoMinutos: atual?.esperadoMinutos ?? 0,
        saldoMinutos: atual?.saldoMinutos ?? 0,
      }}
      saldoAcumulado={reports.reduce(
        (acc, report) => acc + (report.rows[0]?.saldoMinutos ?? 0),
        0,
      )}
    />
  );
}
