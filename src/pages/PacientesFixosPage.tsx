// AI dev note: Página /pacientes-fixos (admin + secretaria). Pacientes da
// fisioterapia motora com frequência combinada: quem falta marcar na semana,
// envio do link da agenda pública, agenda da semana em um clique e adiamentos.

import React from 'react';
import { PacientesFixosManager } from '@/components/domain/pacientes-fixos';

export const PacientesFixosPage: React.FC = () => <PacientesFixosManager />;

PacientesFixosPage.displayName = 'PacientesFixosPage';
