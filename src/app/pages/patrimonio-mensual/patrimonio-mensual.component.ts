import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';

import { PatrimonioService } from '../../services/patrimonio.service';
import { ConfirmDialogComponent } from '../../shared/confirm-dialog/confirm-dialog.component';

interface RegistroMensual {
  mes: string; // formato "YYYY-MM"
  valores: { [categoria: string]: number };
}

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
    MatTableModule,
    MatDialogModule,
    ConfirmDialogComponent
  ],
  templateUrl: './patrimonio-mensual.component.html',
  styleUrls: ['./patrimonio-mensual.component.scss']
})
export class PatrimonioMensualComponent implements OnInit {

  categorias = ['Acciones', 'Fondos', 'Inmuebles', 'Liquidez', 'Cripto'];

  categoria = '';
  mes = '';         // tipo "2025-02" (input type="month")
  valor = 0;

  registros: RegistroMensual[] = [];

  constructor(
    private patrimonioService: PatrimonioService,
    private dialog: MatDialog,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // 1) Cargar inicialmente desde el servicio (si hay datos)
    this.registros = this.patrimonioService.getRegistros() || [];

    // 2) Suscribirse para recibir actualizaciones en tiempo real
    this.patrimonioService.registros$.subscribe(regs => {
      // reasignamos referencia (mejor para que Angular detecte cambios)
      this.registros = regs || [];
      // por si acaso forzamos la detección
      try { this.cdr.detectChanges(); } catch (e) { /* noop */ }
    });
  }

  guardar() {
    if (!this.categoria || !this.mes || !this.valor) return;

    const mesNormalizado = this.mes; // asumimos formato "YYYY-MM"

    let existente = this.registros.find(r => r.mes === mesNormalizado);

    if (!existente) {
      existente = {
        mes: mesNormalizado,
        valores: {}
      };
      // inicializar categorías a 0 para consistencia
      this.categorias.forEach(cat => existente!.valores[cat] = 0);
      this.registros.push(existente);
    }

    // actualizar solo la categoría indicada
    existente.valores[this.categoria] = this.valor;

    // ordenar y persistir mediante el servicio (emite y guarda en localStorage)
    this.registros.sort((a, b) => a.mes.localeCompare(b.mes));
    this.patrimonioService.actualizarRegistros(this.registros);

    // reset campo valor para nueva entrada
    this.valor = 0;
  }

  getTotal(r: RegistroMensual): number {
    return this.categorias.reduce((s, c) => s + (r.valores[c] || 0), 0);
  }

  // Método con diálogo y actualización vía servicio (esto dispara la suscripción)
  eliminarRegistro(registro: RegistroMensual) {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: { mensaje: `¿Eliminar los datos del mes ${registro.mes}?` },
      width: '420px'
    });

    dialogRef.afterClosed().subscribe(confirmado => {
      if (!confirmado) return;

      const nuevos = this.registros.filter(r => r.mes !== registro.mes);

      // Actualizamos por el servicio -> guarda + .next() -> todos los suscriptores reaccionan
      this.patrimonioService.actualizarRegistros(nuevos);

      // forzar detección por si la vista no se actualiza instant
      try { this.cdr.detectChanges(); } catch (e) {}
    });
  }
}
