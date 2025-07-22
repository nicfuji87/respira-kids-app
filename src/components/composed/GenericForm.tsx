import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/primitives/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/primitives/form';
import { Input } from '@/components/primitives/input';
import { Textarea } from '@/components/primitives/textarea';
import { Button } from '@/components/primitives/button';
import { Switch } from '@/components/primitives/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/primitives/select';
import { ColorPicker } from './ColorPicker';
import type { UseFormReturn } from 'react-hook-form';
import { Loader2 } from 'lucide-react';

// AI dev note: GenericForm reutilizável para CRUD
// Suporta diferentes tipos de campos e validação automática

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'number' | 'textarea' | 'select' | 'switch' | 'color';
  placeholder?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  disabled?: boolean;
  description?: string;
}

export interface GenericFormProps {
  isOpen: boolean;
  onClose: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onSubmit: (data: any) => void | Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  fields: FormField[];
  title: string;
  description?: string;
  isEditing?: boolean;
  loading?: boolean;
  submitText?: string;
  cancelText?: string;
}

export const GenericForm = React.memo<GenericFormProps>(
  ({
    isOpen,
    onClose,
    onSubmit,
    form,
    fields,
    title,
    description,
    isEditing = false,
    loading = false,
    submitText,
    cancelText = 'Cancelar',
  }) => {
    const defaultSubmitText = isEditing ? 'Salvar' : 'Criar';

    const renderField = (field: FormField) => {
      return (
        <FormField
          key={field.name}
          control={form.control}
          name={field.name}
          render={({ field: formField }) => (
            <FormItem>
              <FormLabel>
                {field.label}
                {field.required && <span className="text-destructive ml-1">*</span>}
              </FormLabel>
              <FormControl>
                {field.type === 'text' && (
                  <Input
                    {...formField}
                    placeholder={field.placeholder}
                    disabled={field.disabled || loading}
                  />
                )}
                
                {field.type === 'number' && (
                  <Input
                    {...formField}
                    type="number"
                    placeholder={field.placeholder}
                    disabled={field.disabled || loading}
                    value={formField.value || ''}
                    onChange={(e) => formField.onChange(Number(e.target.value) || 0)}
                  />
                )}
                
                {field.type === 'textarea' && (
                  <Textarea
                    {...formField}
                    placeholder={field.placeholder}
                    disabled={field.disabled || loading}
                    rows={3}
                  />
                )}
                
                {field.type === 'select' && (
                  <Select
                    value={formField.value}
                    onValueChange={formField.onChange}
                    disabled={field.disabled || loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                
                {field.type === 'switch' && (
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={formField.value}
                      onCheckedChange={formField.onChange}
                      disabled={field.disabled || loading}
                    />
                    <span className="text-sm text-muted-foreground">
                      {formField.value ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                )}
                
                {field.type === 'color' && (
                  <ColorPicker
                    value={formField.value}
                    onChange={formField.onChange}
                    disabled={field.disabled || loading}
                  />
                )}
              </FormControl>
              
              {field.description && (
                <div className="text-sm text-muted-foreground">
                  {field.description}
                </div>
              )}
              
              <FormMessage />
            </FormItem>
          )}
        />
      );
    };

    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && (
              <DialogDescription>{description}</DialogDescription>
            )}
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {fields.map(renderField)}
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  disabled={loading}
                >
                  {cancelText}
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {submitText || defaultSubmitText}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }
);

GenericForm.displayName = 'GenericForm'; 