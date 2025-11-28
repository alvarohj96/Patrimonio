import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { ChartOptions } from 'chart.js';

// Import chart directive (ng2-charts v8)
import { BaseChartDirective } from 'ng2-charts';
import {
  Chart,
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  BarElement,
  BarController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  LineController
} from 'chart.js';

Chart.register(
  ArcElement,
  Tooltip,
  Legend,
  DoughnutController,
  BarElement,
  CategoryScale,
  LinearScale,
  BarController,
  LineElement,
  PointElement,
  CategoryScale,
  LinearScale,
  LineController
);
import { PatrimonioService } from '../../services/patrimonio.service';

interface RegistroMensual {
  mes: string;
  valores: { [categoria: string]: number };
}

@Component({
  selector: 'app-patrimonio-general',
  standalone: true,
  imports: [
    CommonModule,
    DecimalPipe,
    MatCardModule,
    MatTableModule,
    BaseChartDirective
  ],
  templateUrl: './patrimonio-general.component.html',
  styleUrls: ['./patrimonio-general.component.scss']
})
export class PatrimonioGeneralComponent implements OnInit {

  ultimoMes = '';
  datosUltimoMes: { categoria: string, valor: number }[] = [];
  total = 0;

  // 🔵 Gráfico DONUT (ng2-charts 8 usa esta estructura)
  chartData = {
    labels: [] as string[],
    datasets: [
      {
        data: [] as number[],
        backgroundColor: [
          '#2196F3',
          '#FFC107',
          '#FF5722',
          '#9C27B0'
        ]
      }
    ]
  };

  barChartData = {
    labels: [] as string[],
    datasets: [] as {
      label: string;
      data: number[];
      backgroundColor: string; // Opcional, o usar colores dinámicos
    }[]
  };

  lineChartData = {
    labels: [] as string[], // meses
    datasets: [] as { label: string; data: number[]; borderColor: string; tension: number }[]
  };

  public barChartOptions: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      x: {
        stacked: true,
      },
      y: {
        stacked: true,
        title: {
          display: true,
          text: 'Valor (€)'
        }
      }
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      tooltip: {
        mode: 'index' as const, // Mantener 'as const' aquí
        intersect: false,
      }
    }
  };

  public barChartType = 'bar' as const;

  constructor(private patrimonioService: PatrimonioService) { }

  private generateDynamicColor(index: number): string {
    const hue = (index * 137.508) % 360;
    // Saturation y Lightness fijos para buena visibilidad.
    return `hsl(${hue}, 70%, 50%)`;
  }

  ngOnInit(): void {
    this.patrimonioService.registros$.subscribe(registros => {

      if (!registros || registros.length === 0) {
        this.datosUltimoMes = [];
        this.ultimoMes = '';
        this.total = 0;
        this.chartData.labels = [];
        this.chartData.datasets[0].data = [];
        return;
      }

      // 💡 1. Obtener todas las categorías únicas de *todos* los registros
      const todasLasCategorias = new Set<string>();
      registros.forEach(r => {
        Object.keys(r.valores).forEach(cat => todasLasCategorias.add(cat));
      });
      const categoriasArray = Array.from(todasLasCategorias);

      // 📌 Obtener el último mes disponible
      registros.sort((a, b) => a.mes.localeCompare(b.mes));
      const ultimo = registros[registros.length - 1];

      this.ultimoMes = ultimo.mes;

      // 📌 Convertir valores en array usable para tabla y gráfico
      this.datosUltimoMes = Object.keys(ultimo.valores).map(cat => ({
        categoria: cat,
        valor: ultimo.valores[cat] || 0
      }));

      // 📌 Total global
      this.total = this.datosUltimoMes.reduce((s, x) => s + x.valor, 0);

      // 🔥 Actualizar GRÁFICO en tiempo real
      this.chartData.labels = this.datosUltimoMes.map(d => d.categoria);
      this.chartData.datasets[0].data = this.datosUltimoMes.map(d => d.valor);

      // 🔍 Reemplaza 'this.categorias' con las categorías del último mes o las categorías únicas de *todos* los registros
      const categoriasUnicas = Object.keys(ultimo.valores); // Usando las categorías del último mes como base.

      const totalesPorMes = registros.map(r =>
        categoriasUnicas.reduce((s, cat) => s + (r.valores[cat] || 0), 0));
      this.barChartData.labels = registros.map(r => r.mes);

      this.barChartData.datasets = categoriasArray.map((categoria, index) => {
        // Mapea el valor de esta *categoría* para *cada mes*
        const dataPorMes = registros.map(r => r.valores[categoria] || 0);

        return {
          label: categoria,
          data: dataPorMes,
          backgroundColor: this.generateDynamicColor(index)
        };
      });

      // ===============================================
      // 📈 GENERAR GRÁFICA DE LÍNEAS POR CATEGORÍA
      // ===============================================
      const categorias = Object.keys(registros[0].valores);

      // eje X = todos los meses ordenados
      const mesesOrdenados = registros.map(r => r.mes);

      // inicializar datasets
      const datasets = categorias.map((categoria, idx) => {
        // color automático
        const colores = ["#2196F3", "#4CAF50", "#FFC107", "#9C27B0", "#FF5722", "#009688"];
        const color = colores[idx % colores.length];

        // valores por mes
        const valores = registros.map(r => r.valores[categoria] || 0);

        return {
          label: categoria,
          data: valores,
          borderColor: color,
          tension: 0.2
        };
      });

      this.lineChartData.labels = mesesOrdenados;
      this.lineChartData.datasets = datasets;
    });
  }
}
