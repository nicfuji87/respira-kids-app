import type { Control, FieldValues, Path } from 'react-hook-form';
import { User, FileText, Stethoscope, MessageSquare } from 'lucide-react';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import type { UserRole } from '@/lib/navigation';

// AI dev note: ProfileFormFields combina campos específicos do perfil profissional
// Reutilizável para diferentes contextos de edição de perfil

export interface ProfileFormFieldsProps<T extends FieldValues> {
  control: Control<T>;
  isLoading?: boolean;
  userRole?: UserRole;
  showAllFields?: boolean; // Para admin ver todos os campos
}

// Especialidades disponíveis por área
const especialidades = [
  'Fisioterapia Respiratória',
  'Fisioterapia Neurológica',
  'Fisioterapia Ortopédica',
  'Fisioterapia Pediátrica',
  'Fisioterapia Geriátrica',
  'Fisioterapia Desportiva',
  'Fisioterapia Aquática',
  'Terapia Ocupacional',
  'Fonoaudiologia',
  'Psicologia',
  'Nutrição',
  'Enfermagem',
  'Medicina',
  'Outras',
];

export const ProfileFormFields = <T extends FieldValues>({
  control,
  isLoading = false,
  userRole,
  showAllFields = false,
}: ProfileFormFieldsProps<T>) => {
  // Definir quais campos mostrar baseado no role
  const shouldShowProfessionalFields =
    showAllFields || userRole === 'admin' || userRole === 'profissional';

  return (
    <div className="space-y-4">
      {/* Registro Profissional - apenas para profissionais */}
      {shouldShowProfessionalFields && (
        <FormField
          control={control}
          name={'registro_profissional' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground font-medium">
                Registro Profissional
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <FileText
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    {...field}
                    placeholder="Ex: CREFITO 123456-F"
                    disabled={isLoading}
                    className="pl-10 h-12 theme-transition"
                    value={field.value || ''}
                    aria-describedby="registro-profissional-error"
                  />
                </div>
              </FormControl>
              <FormMessage id="registro-profissional-error" />
            </FormItem>
          )}
        />
      )}

      {/* Especialidade - apenas para profissionais */}
      {shouldShowProfessionalFields && (
        <FormField
          control={control}
          name={'especialidade' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground font-medium">
                Especialidade
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <Stethoscope
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10"
                    aria-hidden="true"
                  />
                  <Select
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="pl-10 h-12 theme-transition">
                      <SelectValue placeholder="Selecione sua especialidade" />
                    </SelectTrigger>
                    <SelectContent>
                      {especialidades.map((especialidade) => (
                        <SelectItem key={especialidade} value={especialidade}>
                          {especialidade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </FormControl>
              <FormMessage id="especialidade-error" />
            </FormItem>
          )}
        />
      )}

      {/* Bio Profissional - apenas para profissionais */}
      {shouldShowProfessionalFields && (
        <FormField
          control={control}
          name={'bio_profissional' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground font-medium">
                Bio Profissional
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <MessageSquare
                    className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Textarea
                    {...field}
                    placeholder="Conte sobre sua experiência, formação e abordagem profissional..."
                    disabled={isLoading}
                    className="pl-10 min-h-[100px] theme-transition resize-none"
                    value={field.value || ''}
                    rows={4}
                    maxLength={500}
                    aria-describedby="bio-profissional-error bio-profissional-help"
                  />
                </div>
              </FormControl>
              <div className="flex justify-between items-center">
                <FormMessage id="bio-profissional-error" />
                <p
                  id="bio-profissional-help"
                  className="text-xs text-muted-foreground"
                >
                  {field.value?.length || 0}/500 caracteres
                </p>
              </div>
            </FormItem>
          )}
        />
      )}

      {/* Campo Role - apenas para admin */}
      {(userRole === 'admin' || showAllFields) && (
        <FormField
          control={control}
          name={'role' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-foreground font-medium">
                Nível de Acesso
              </FormLabel>
              <FormControl>
                <div className="relative">
                  <User
                    className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground z-10"
                    aria-hidden="true"
                  />
                  <Select
                    value={field.value || ''}
                    onValueChange={field.onChange}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="pl-10 h-12 theme-transition">
                      <SelectValue placeholder="Selecione o nível de acesso" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">
                        Administrador - Acesso total
                      </SelectItem>
                      <SelectItem value="profissional">
                        Profissional - Atendimentos e agenda
                      </SelectItem>
                      <SelectItem value="secretaria">
                        Secretária - Agenda e cadastros
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FormControl>
              <FormMessage id="role-error" />
            </FormItem>
          )}
        />
      )}
    </div>
  );
};

ProfileFormFields.displayName = 'ProfileFormFields';
