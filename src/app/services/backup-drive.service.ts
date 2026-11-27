import { Injectable, InjectionToken, computed, inject, signal } from '@angular/core';
import {
  ConfigBackupDrive,
  CopiaPendiente,
  EstadoConexion,
  ResultadoBackup,
  TipoCopia,
  UltimaCopia,
  UltimoError
} from '../models/backup-drive';
import {
  formatearRuta,
  hayCopiaPendiente,
  necesitaCopiaMensual,
  nombreArchivoManual,
  nombreArchivoMensual,
  periodoDe
} from '../shared/backup-drive.utils';
import { nombresProblematicosCsv, serializarRegistrosCsv } from '../shared/csv-patrimonio';
import { ErrorBackup, esErrorBackup } from '../shared/error-backup';
import { DriveApiService } from './drive-api.service';
import { GoogleAuthService } from './google-auth.service';
import { GooglePickerService } from './google-picker.service';
import { PatrimonioService } from './patrimonio.service';

/** Reloj inyectable (los tests fijan la fecha). */
export const AHORA = new InjectionToken<() => Date>('AHORA', { providedIn: 'root', factory: () => () => new Date() });

const LS_CONFIG = 'backup_drive_config';
const LS_ULTIMA = 'backup_drive_ultima';
const LS_ERROR = 'backup_drive_error';
const LS_PENDIENTE = 'backup_drive_pendiente';

/** Fallos que se deben a una decisión del usuario: no se guarda copia pendiente ni se insiste. */
const DECISION_USUARIO = new Set(['cancelado', 'permiso-denegado', 'no-configurado', 'sin-datos']);

export type ResultadoComprobacion =
  'desactivada' | 'no-configurado' | 'al-dia' | 'sin-datos' | 'copiada' | 'requiere-accion';

export interface AvisoCopia {
  mensaje: string;
}

interface OpcionesCopia {
  tipo: TipoCopia;
  /** `true` si viene de un clic del usuario (puede abrir la ventana de Google) */
  interactivo: boolean;
  /** Reintenta la copia que quedó pendiente (mismo CSV y nombre) en lugar de generar una nueva */
  usarPendiente?: boolean;
}

/**
 * Copias de seguridad mensuales en Google Drive (formato CSV idéntico al de «Exportar CSV»).
 *
 * Una app web no puede ejecutar nada en segundo plano: la copia automática se comprueba al abrir la app
 * (y al recuperar la conexión). Si hace falta que el usuario confirme algo en Google, se muestra un aviso
 * no intrusivo con un clic para hacerla; si falla la red o la API, el CSV se conserva como copia pendiente.
 */
@Injectable({ providedIn: 'root' })
export class BackupDriveService {

  private readonly patrimonio = inject(PatrimonioService);
  private readonly auth = inject(GoogleAuthService);
  private readonly drive = inject(DriveApiService);
  private readonly picker = inject(GooglePickerService);
  private readonly ahora = inject(AHORA);

  readonly config = signal<ConfigBackupDrive>(this.cargarConfig());
  readonly ultimaCopia = signal<UltimaCopia | null>(this.leer<UltimaCopia>(LS_ULTIMA, v => typeof v?.driveFileId === 'string'));
  readonly ultimoError = signal<UltimoError | null>(this.leer<UltimoError>(LS_ERROR, v => typeof v?.mensaje === 'string'));
  readonly pendiente = signal<CopiaPendiente | null>(
    this.leer<CopiaPendiente>(LS_PENDIENTE, v => typeof v?.csv === 'string' && typeof v?.nombreArchivo === 'string'));

  /** Hay una copia o una operación con Google en curso. */
  readonly trabajando = signal(false);

  /** Aviso no intrusivo (banner) cuando hace falta una acción del usuario. */
  readonly aviso = signal<AvisoCopia | null>(null);

  readonly estadoConexion = computed<EstadoConexion>(() =>
    !this.auth.configurado ? 'no-configurado' : this.auth.conectado() ? 'conectado' : 'desconectado');

  readonly configurado = computed(() => this.auth.configurado);
  readonly selectorDisponible = computed(() => this.auth.selectorDisponible);
  readonly hayPendiente = computed(() => hayCopiaPendiente(this.pendiente()));

  private enCurso: Promise<ResultadoBackup> | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      // Al recuperar la conexión se reintenta lo que quedó pendiente
      window.addEventListener('online', () => void this.comprobarCopiaMensual());
    }
  }

  // ======================================================
  // Conexión
  // ======================================================

  /** Abre la ventana de Google (llamar desde un clic). */
  async conectar(): Promise<void> {
    await this.conTrabajo(async () => {
      await this.auth.obtenerToken({ interactivo: true });
      this.guardarConfig({ ...this.config(), conectadoAntes: true });
    });
  }

  async desconectar(): Promise<void> {
    await this.auth.desconectar();
    this.guardarConfig({ ...this.config(), conectadoAntes: false });
  }

  precargar(): void {
    this.auth.precargar();
  }

  // ======================================================
  // Configuración
  // ======================================================

  establecerAutomatica(activa: boolean): void {
    this.guardarConfig({ ...this.config(), automatica: activa });
    if (!activa) this.aviso.set(null);
  }

  /** Vuelve a «Mi unidad» (raíz del Drive). */
  usarRaiz(): void {
    this.guardarConfig({ ...this.config(), carpetaId: 'root', carpetaRuta: 'Mi unidad' });
  }

  /** Selector de carpetas de Google (navegación y búsqueda en el Drive del usuario). */
  async seleccionarCarpeta(): Promise<boolean> {
    return this.conTrabajo(async () => {
      const token = await this.auth.obtenerToken({ interactivo: true });
      const elegida = await this.picker.elegirCarpeta(token);
      if (!elegida) return false;

      const ruta = await this.drive.resolverRuta(token, elegida.id);
      this.guardarConfig({ ...this.config(), carpetaId: elegida.id, carpetaRuta: ruta || elegida.name, conectadoAntes: true });
      return true;
    });
  }

  /** Crea una carpeta nueva dentro de la carpeta actual y la elige como destino. */
  async crearCarpeta(nombre: string): Promise<void> {
    const limpio = nombre.trim();
    if (!limpio) throw new ErrorBackup('api', 'Escribe un nombre para la carpeta');

    await this.conTrabajo(async () => {
      const token = await this.auth.obtenerToken({ interactivo: true });
      const actual = this.config();
      const creada = await this.drive.crearCarpeta(token, limpio, actual.carpetaId);
      this.guardarConfig({
        ...actual,
        carpetaId: creada.id,
        carpetaRuta: formatearRuta([actual.carpetaRuta, creada.name]),
        conectadoAntes: true
      });
    });
  }

  // ======================================================
  // Copias
  // ======================================================

  /** Botón «Crear copia ahora». */
  crearCopiaAhora(): Promise<ResultadoBackup> {
    return this.ejecutarCopia({ tipo: 'manual', interactivo: true });
  }

  /** Hace ahora, desde un clic, la copia mensual (o la pendiente) a la que se refiere el aviso. */
  hacerCopiaMensualAhora(): Promise<ResultadoBackup> {
    const p = this.pendiente();
    return hayCopiaPendiente(p)
      ? this.ejecutarCopia({ tipo: p.tipo, interactivo: true, usarPendiente: true })
      : this.ejecutarCopia({ tipo: 'automatica', interactivo: true });
  }

  /** Reintenta la copia pendiente desde un clic del usuario. */
  reintentarPendiente(): Promise<ResultadoBackup> {
    const p = this.pendiente();
    return this.ejecutarCopia({ tipo: p?.tipo ?? 'manual', interactivo: true, usarPendiente: hayCopiaPendiente(p) });
  }

  /**
   * Comprobación al abrir la app: si la copia automática está activada y no hay copia del mes en curso (o
   * quedó una pendiente), intenta hacerla sin interacción; si Google necesita al usuario, deja un aviso.
   */
  async comprobarCopiaMensual(): Promise<ResultadoComprobacion> {
    if (!this.config().automatica) return 'desactivada';
    if (!this.auth.configurado) return 'no-configurado';
    if (this.trabajando()) return 'al-dia';

    const hayPendiente = this.hayPendiente();
    const toca = necesitaCopiaMensual(this.ultimaCopia(), this.ahora());
    if (!hayPendiente && !toca) return 'al-dia';
    if (!hayPendiente && this.patrimonio.getRegistros().length === 0) return 'sin-datos';

    // Sin token ni autorización previa no se abre ninguna ventana por sorpresa: aviso con un clic
    if (!this.auth.tieneTokenValido() && !this.config().conectadoAntes) {
      this.avisarPendiente();
      return 'requiere-accion';
    }

    if (hayPendiente) {
      const r = await this.ejecutarCopia({ tipo: this.pendiente()!.tipo, interactivo: false, usarPendiente: true });
      if (!r.ok) return this.resultadoTrasFallo(r);
    }
    if (necesitaCopiaMensual(this.ultimaCopia(), this.ahora()) && this.patrimonio.getRegistros().length > 0) {
      const r = await this.ejecutarCopia({ tipo: 'automatica', interactivo: false });
      if (!r.ok) return this.resultadoTrasFallo(r);
    }
    return 'copiada';
  }

  descartarAviso(): void {
    this.aviso.set(null);
  }

  // ======================================================
  // Implementación
  // ======================================================

  private ejecutarCopia(opciones: OpcionesCopia): Promise<ResultadoBackup> {
    if (this.enCurso) return this.enCurso;
    this.trabajando.set(true);
    this.enCurso = this.subir(opciones).finally(() => {
      this.enCurso = null;
      this.trabajando.set(false);
    });
    return this.enCurso;
  }

  private async subir({ tipo, interactivo, usarPendiente }: OpcionesCopia): Promise<ResultadoBackup> {
    const ahora = this.ahora();
    const periodo = periodoDe(ahora);
    const pend = usarPendiente ? this.pendiente() : null;
    const registros = this.patrimonio.getRegistros();

    if (!pend && registros.length === 0) {
      return this.fallo(new ErrorBackup('sin-datos'), [], ahora, false);
    }

    const csv = pend?.csv ?? serializarRegistrosCsv(registros);
    const nombre = pend?.nombreArchivo ?? (tipo === 'automatica' ? nombreArchivoMensual(periodo) : nombreArchivoManual(ahora));
    const periodoCopia = pend?.periodo ?? periodo;
    const avisos = pend ? [] : this.avisosCsv(registros);

    try {
      const carpeta = this.config();
      let token = await this.auth.obtenerToken({ interactivo });

      const subida = () => this.drive.subirCsv(token, {
        nombre,
        contenido: csv,
        carpetaId: carpeta.carpetaId,
        // La copia mensual es una por mes y carpeta; las manuales son siempre archivos nuevos
        reemplazarSiExiste: tipo === 'automatica'
      });

      let archivo;
      try {
        archivo = await subida();
      } catch (e) {
        if (!(esErrorBackup(e) && e.codigo === 'token-caducado')) throw e;
        // El token expiró en el servidor: se renueva una vez y se repite
        this.auth.olvidarToken();
        token = await this.auth.obtenerToken({ interactivo });
        archivo = await subida();
      }

      const copia: UltimaCopia = {
        lastBackupAt: ahora.toISOString(),
        lastBackupPeriod: periodoCopia,
        driveFileId: archivo.id,
        driveFolderPath: carpeta.carpetaRuta,
        fileName: archivo.name || nombre,
        status: 'ok',
        tipo
      };
      this.ultimaCopia.set(copia);
      this.escribir(LS_ULTIMA, copia);
      this.ultimoError.set(null);
      localStorage.removeItem(LS_ERROR);
      this.pendiente.set(null);
      localStorage.removeItem(LS_PENDIENTE);
      this.aviso.set(null);
      if (!this.config().conectadoAntes) this.guardarConfig({ ...this.config(), conectadoAntes: true });

      return { ok: true, copia, avisos };
    } catch (e) {
      const error = esErrorBackup(e) ? e : new ErrorBackup('api', e instanceof Error ? e.message : undefined);
      const guardar = !DECISION_USUARIO.has(error.codigo);
      if (guardar) {
        this.guardarPendiente({ periodo: periodoCopia, nombreArchivo: nombre, csv, creadoEn: pend?.creadoEn ?? ahora.toISOString(), tipo });
      }
      return this.fallo(error, avisos, ahora, guardar && error.codigo !== 'sin-conexion' && !interactivo);
    }
  }

  private fallo(error: ErrorBackup, avisos: string[], ahora: Date, avisar: boolean): ResultadoBackup {
    // Cancelar la ventana o denegar el permiso es una decisión del usuario, no un fallo que recordar
    if (error.codigo !== 'cancelado' && error.codigo !== 'sin-datos') {
      const ultimo: UltimoError = { at: ahora.toISOString(), codigo: error.codigo, mensaje: error.message };
      this.ultimoError.set(ultimo);
      this.escribir(LS_ERROR, ultimo);
    }
    if (avisar) this.aviso.set({ mensaje: error.message });
    return { ok: false, error: { at: ahora.toISOString(), codigo: error.codigo, mensaje: error.message }, avisos };
  }

  private resultadoTrasFallo(r: ResultadoBackup): ResultadoComprobacion {
    if (r.error?.codigo === 'sin-datos') return 'sin-datos';
    // Sin conexión no se molesta al usuario: la copia queda pendiente y se reintenta al volver la red
    if (r.error?.codigo === 'sin-conexion') return 'requiere-accion';
    if (!this.aviso()) this.avisarPendiente();
    return 'requiere-accion';
  }

  private avisarPendiente(): void {
    const periodo = periodoDe(this.ahora());
    this.aviso.set({
      mensaje: this.hayPendiente()
        ? 'Hay una copia de seguridad pendiente de subir a Google Drive.'
        : `Toca la copia mensual en Google Drive (${periodo}). Hazla con un clic.`
    });
  }

  private avisosCsv(registros: Parameters<typeof nombresProblematicosCsv>[0]): string[] {
    const malos = nombresProblematicosCsv(registros);
    return malos.length
      ? [`Estos nombres contienen «;» o saltos de línea y no se podrán importar bien desde el CSV: ${malos.join(', ')}.`]
      : [];
  }

  private async conTrabajo<T>(operacion: () => Promise<T>): Promise<T> {
    this.trabajando.set(true);
    try {
      return await operacion();
    } finally {
      this.trabajando.set(false);
    }
  }

  // ======================================================
  // Almacenamiento local (nunca se guardan tokens)
  // ======================================================

  private cargarConfig(): ConfigBackupDrive {
    const base: ConfigBackupDrive = { version: 1, automatica: false, carpetaId: 'root', carpetaRuta: 'Mi unidad', conectadoAntes: false };
    const g = this.leer<Partial<ConfigBackupDrive>>(LS_CONFIG, v => typeof v === 'object' && v !== null && !Array.isArray(v));
    if (!g) return base;
    return {
      version: 1,
      automatica: g.automatica === true,
      carpetaId: typeof g.carpetaId === 'string' && g.carpetaId.trim() ? g.carpetaId : base.carpetaId,
      carpetaRuta: typeof g.carpetaRuta === 'string' && g.carpetaRuta.trim() ? g.carpetaRuta : base.carpetaRuta,
      conectadoAntes: g.conectadoAntes === true
    };
  }

  private guardarConfig(config: ConfigBackupDrive): void {
    this.config.set(config);
    this.escribir(LS_CONFIG, config);
  }

  private guardarPendiente(p: CopiaPendiente): void {
    this.pendiente.set(p);
    this.escribir(LS_PENDIENTE, p);
  }

  private leer<T>(clave: string, valido: (v: any) => boolean): T | null {
    try {
      const raw = localStorage.getItem(clave);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return valido(v) ? (v as T) : null;
    } catch {
      return null;
    }
  }

  private escribir(clave: string, valor: unknown): void {
    try {
      localStorage.setItem(clave, JSON.stringify(valor));
    } catch (e) {
      console.error(`No se pudo guardar ${clave}`, e);
    }
  }
}
