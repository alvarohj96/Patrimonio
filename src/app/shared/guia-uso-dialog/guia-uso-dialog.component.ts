import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-guia-uso-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatExpansionModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './guia-uso-dialog.component.html',
  styleUrls: ['./guia-uso-dialog.component.scss']
})
export class GuiaUsoDialogComponent {
  constructor(public dialogRef: MatDialogRef<GuiaUsoDialogComponent>) {}
}
