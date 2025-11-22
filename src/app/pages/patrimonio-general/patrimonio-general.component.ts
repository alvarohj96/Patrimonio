import { Component, OnInit } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
import { PatrimonioService } from '../../services/patrimonio.service';

@Component({
  selector: 'app-patrimonio-general',
  standalone: true,
  imports: [CommonModule, DecimalPipe],
  templateUrl: './patrimonio-general.component.html',
  styleUrls: ['./patrimonio-general.component.scss']
})
export class PatrimonioGeneralComponent implements OnInit {

  patrimonio: any[] = [];
  total = 0;

  constructor(private patrimonioService: PatrimonioService) {}

  ngOnInit(): void {
    this.patrimonio = this.patrimonioService.getPatrimonioGeneral();
    this.total = this.patrimonio.reduce((s, p) => s + p.total, 0);
  }
}