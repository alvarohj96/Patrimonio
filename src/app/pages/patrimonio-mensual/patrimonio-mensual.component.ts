import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MAT_DATE_FORMATS } from '@angular/material/core';
export const FORMATO_MES = {
  parse: {
    dateInput: 'MM/YYYY',
  },
  display: {
    dateInput: 'MM/YYYY',
    monthYearLabel: 'MMM YYYY',
    dateA11yLabel: 'LL',
    monthYearA11yLabel: 'MMMM YYYY'
  }
};
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';

import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';
import { GestionarCategoriasComponent } from '../../shared/gestionar-categorias/gestionar-categorias.component';
import { GestionarSubcategoriasComponent } from '../../shared/gestionar-subcategorias/gestionar-subcategorias.component';
import { RegistroMensual, PatrimonioService } from '../../services/patrimonio.service';
import { DetalleMensualDialogComponent } from '../../shared/detalle-mensual-dialog/detalle-mensual-dialog.component';

@Component({
  selector: 'app-patrimonio-mensual',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatDialogModule,
    MatCardModule,
    MatDatepickerModule,
    MatNativeDateModule
  ],
  templateUrl: './patrimonio-mensual.component.html',
  styleUrls: ['./patrimonio-mensual.component.scss'],
  providers: [
    { provide: MAT_DATE_FORMATS, useValue: FORMATO_MES }
  ]
})
export class PatrimonioMensualComponent implements OnInit {

  categorias: string[] = [];

  registros: RegistroMensual[] = [];

  // Subcategorías 100% centralizadas en el servicio
  subcategoriasPorCategoria: { [cat: string]: string[] } = {};

  categoria = '';
  subcategoria = '';
  nuevaSubcategoria = '';
  mes = '';
  valor = 0;
  mesSeleccionado: Date | null = null;

  constructor(
    private patrimonioService: PatrimonioService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {

    this.categorias = this.patrimonioService.getCategorias();

    // Subcategorías iniciales desde el servicio
    this.subcategoriasPorCategoria = this.patrimonioService.getMapaSubcategorias();

    // Cargar registros actuales
    this.registros = this.patrimonioService.getRegistros();

    this.patrimonioService.registros$.subscribe(() => {
      this.categorias = this.patrimonioService.getCategorias();
    });

    // Subscribirse a cambios futuros
    this.patrimonioService.registros$.subscribe(regs => {
      this.registros = regs;
      this.cdr.detectChanges();
    });
  }

  abrirGestionSubcategorias() {
    this.dialog.open(GestionarSubcategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '90vh',
      panelClass: 'dialogo-ancho'
    });
  }


  onCategoriaChange() {
    this.subcategoria = '';
    this.nuevaSubcategoria = '';
  }

  guardar() {
    const subOk = this.subcategoria === '__nueva__'
      ? this.nuevaSubcategoria.trim()
      : this.subcategoria;

    if (!this.categoria || !subOk || !this.mes || !this.valor) return;

    // Buscar mes existente
    let registro = this.registros.find(r => r.mes === this.mes);

    // Si no existe → crear
    if (!registro) {
      registro = { mes: this.mes, valores: {} };
      this.registros.push(registro);
    }

    // Asegurar estructura de categoría
    if (!registro.valores[this.categoria]) {
      registro.valores[this.categoria] = {};
    }

    // Guardar valor por subcategoría
    registro.valores[this.categoria][subOk] = this.valor;

    // Registrar subcategoría en el servicio (persistente)
    this.patrimonioService.addSubcategoria(this.categoria, subOk);

    // Guardar cambios globales
    this.patrimonioService.actualizarRegistros(this.registros);

    // Reset formulario
    this.valor = 0;
    this.subcategoria = '';
    this.nuevaSubcategoria = '';
  }

  getCategoriasParaMes(reg: RegistroMensual): string[] {
    return Object.keys(reg.valores);
  }

  getSubcategoriasPara(reg: RegistroMensual, categoria: string): string[] {
    return Object.keys(reg.valores[categoria] || {});
  }

  getTotalCategoria(reg: RegistroMensual, categoria: string): number {
    const valores = reg.valores[categoria] || {};
    return Object.values(valores).reduce((a, b) => a + b, 0);
  }

  getTotalMes(reg: RegistroMensual): number {
    return Object.keys(reg.valores)
      .reduce((sum, cat) => sum + this.getTotalCategoria(reg, cat), 0);
  }

  eliminarRegistro(reg: RegistroMensual) {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { mensaje: `¿Eliminar mes ${this.formatMes(reg.mes)}?` }
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      this.registros = this.registros.filter(r => r !== reg);
      this.patrimonioService.actualizarRegistros(this.registros);
      this.cdr.detectChanges();
    });
  }

  eliminarSubcategoria(reg: RegistroMensual, categoria: string, sub: string) {
    this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: { mensaje: `¿Eliminar subcategoría "${sub}" de ${categoria}?` }
    }).afterClosed().subscribe(ok => {
      if (!ok) return;
      delete reg.valores[categoria][sub];
      this.patrimonioService.actualizarRegistros(this.registros);
      this.cdr.detectChanges();
    });
  }

  actualizarSubcategoria(
    reg: RegistroMensual,
    categoria: string,
    subAnt: string,
    subNueva: string
  ) {
    if (subAnt === subNueva) return;

    const valor = reg.valores[categoria][subAnt];
    delete reg.valores[categoria][subAnt];
    reg.valores[categoria][subNueva] = valor;

    this.patrimonioService.addSubcategoria(categoria, subNueva);
    this.patrimonioService.actualizarRegistros(this.registros);

    this.cdr.detectChanges();
  }

  formatMes(m: string): string {
    const [y, mm] = m.split('-');
    const nombres = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${nombres[+mm - 1]} ${y}`;
  }

  abrirGestionCategorias() {
    this.dialog.open(GestionarCategoriasComponent, {
      width: 'auto',
      maxWidth: '95vw',
      height: 'auto',
      maxHeight: '90vh',
      panelClass: 'dialogo-ancho'
    });
  }

  onMesSeleccionado(e: any) {
    // No se usa, pero lo dejamos por compatibilidad.
  }

  seleccionarMes(event: Date, datepicker: any) {
    const year = event.getFullYear();
    const month = (event.getMonth() + 1).toString().padStart(2, '0');

    this.mes = `${year}-${month}`;   // <-- Aquí guardamos el formato YYYY-MM
    this.mesSeleccionado = event;
    datepicker.close();
  }

  getDiferenciaMes(regActual: RegistroMensual): number | null {
    // Obtener posición del registro actual
    const index = this.registros.indexOf(regActual);

    // Si es el primer mes, no hay diferencia
    if (index <= 0) return null;

    const regAnterior = this.registros[index - 1];
    if (!regAnterior) return null;

    const totalActual = this.getTotalMes(regActual);
    const totalAnterior = this.getTotalMes(regAnterior);

    return totalActual - totalAnterior;
  }

  getPorcentajeMes(regActual: RegistroMensual): number | null {
    const index = this.registros.indexOf(regActual);
    if (index <= 0) return null;

    const regAnterior = this.registros[index - 1];
    if (!regAnterior) return null;

    const totalActual = this.getTotalMes(regActual);
    const totalAnterior = this.getTotalMes(regAnterior);

    if (totalAnterior === 0) return null;

    const diferencia = totalActual - totalAnterior;

    return (diferencia / totalAnterior) * 100;
  }

  abrirDetalle(reg: RegistroMensual) {
    this.dialog.open(DetalleMensualDialogComponent, {
      width: '500px',
      data: {
        mes: this.formatMes(reg.mes),
        valores: reg.valores
      }
    });
  }

  exportarCSV() {
    if (!this.registros || this.registros.length === 0) {
      alert("No hay datos para exportar.");
      return;
    }

    let lineas: string[] = [];

    // Cabecera CSV
    lineas.push("Mes;Categoría;Subcategoría;Valor (€)");

    // Cada registro → muchas líneas
    this.registros.forEach(reg => {
      const mes = reg.mes;

      Object.keys(reg.valores).forEach(cat => {
        const subs = reg.valores[cat];

        Object.keys(subs).forEach(sub => {
          const valor = subs[sub];
          lineas.push(`${mes};${cat};${sub};${valor}`);
        });
      });
    });

    // Convertir a CSV texto
    const csvContent = lineas.join("\n");

    // Crear Blob descargable
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Crear enlace temporal
    const a = document.createElement("a");
    a.href = url;
    a.download = "patrimonio_mensual.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    URL.revokeObjectURL(url);
  }

  importarCSV(event: any) {
    const archivo: File = event.target.files[0];
    if (!archivo) return;

    const lector = new FileReader();

    lector.onload = () => {
      const texto = lector.result as string;

      const lineas = texto.split(/\r?\n/).filter(l => l.trim() !== "");

      if (lineas.length <= 1) {
        alert("El archivo CSV está vacío o no tiene datos válidos.");
        return;
      }

      // Saltamos la cabecera
      lineas.shift();

      const registrosMap: { [mes: string]: any } = {};

      lineas.forEach(linea => {
        const [mes, categoria, subcategoria, valorStr] = linea.split(";");

        if (!mes || !categoria || !subcategoria || !valorStr) return;

        const valor = Number(valorStr);
        if (isNaN(valor)) return;

        // Crear registro si no existe
        if (!registrosMap[mes]) {
          registrosMap[mes] = {
            mes,
            valores: {}
          };
        }

        // Crear categoría si no existe
        if (!registrosMap[mes].valores[categoria]) {
          registrosMap[mes].valores[categoria] = {};
        }

        // Asignar valor
        registrosMap[mes].valores[categoria][subcategoria] = valor;
      });

      // Pasar de mapa a array
      const registrosImportados = Object.values(registrosMap);

      // Guardar en servicio
      this.patrimonioService.actualizarRegistros(registrosImportados as any);

      // Sincronizar subcategorías
      registrosImportados.forEach((reg: any) => {
        Object.keys(reg.valores).forEach(cat => {
          Object.keys(reg.valores[cat]).forEach(sub => {
            this.patrimonioService.addSubcategoria(cat, sub);
          });
        });
      });

      alert("Datos importados correctamente.");
      event.target.value = ""; // Reset input
    };

    lector.readAsText(archivo, "utf-8");
  }

  confirmarBorradoTotal() {
    const ref = this.dialog.open(ConfirmDialogComponent, {
    width: "420px",
    data: { mensaje: "¿Seguro que quieres borrar TODOS los datos?" }
  });

  ref.afterClosed().subscribe(ok => {
    if (!ok) return;

    this.patrimonioService.resetearTodo();
    this.registros = [];
    this.categorias = this.patrimonioService.getCategorias();
    this.subcategoriasPorCategoria = this.patrimonioService.getMapaSubcategorias();
  });
  }
}
