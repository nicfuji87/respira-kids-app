import React, { useState, useMemo } from 'react';
import { Button } from '@/components/primitives/button';
import { Input } from '@/components/primitives/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/primitives/table';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/primitives/card';
import { Search, Plus, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

// AI dev note: GenericTable reutilizável para listagens
// Combina Table primitive com funcionalidades de busca, paginação e ações

export interface GenericTableColumn<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  sortable?: boolean;
}

export interface GenericTableProps<T> {
  title?: string;
  description?: string;
  data: T[];
  columns: GenericTableColumn<T>[];
  loading?: boolean;
  onAdd?: () => void;
  onFilter?: () => void;
  addButtonText?: string;
  filterButtonText?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  className?: string;
  itemsPerPage?: number;
  onSearch?: (query: string) => void;
  searchQuery?: string;
  showSearch?: boolean; // Nova prop para controlar exibição da busca
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const GenericTable = <T extends Record<string, any>>({
  title,
  description,
  data,
  columns,
  loading = false,
  searchPlaceholder = 'Buscar...',
  onAdd,
  onFilter,
  addButtonText = 'Adicionar',
  filterButtonText = 'Filtros',
  emptyMessage = 'Nenhum item encontrado',
  itemsPerPage = 10,
  className,
  showSearch = false, // Padrão false para não mostrar busca interna
}: GenericTableProps<T>) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  // Filtrar dados baseado na busca
  const filteredData = useMemo(() => {
    if (!searchTerm) return data;

    return data.filter((item) =>
      Object.values(item).some((value) =>
        String(value).toLowerCase().includes(searchTerm.toLowerCase())
      )
    );
  }, [data, searchTerm]);

  // Calcular paginação
  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedData = filteredData.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  // Reset página quando filtro muda
  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  return (
    <Card className={cn('w-full', className)}>
      <CardHeader>
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <CardTitle>{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </div>

          <div className="flex items-center gap-2">
            {/* Busca */}
            {showSearch && (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={searchPlaceholder}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            )}

            {/* Filtros */}
            {onFilter && (
              <Button variant="outline" size="sm" onClick={onFilter}>
                <Filter className="mr-2 h-4 w-4" />
                {filterButtonText}
              </Button>
            )}

            {/* Adicionar */}
            {onAdd && (
              <Button size="sm" onClick={onAdd}>
                <Plus className="mr-2 h-4 w-4" />
                {addButtonText}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {/* Loading state */}
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted-foreground">Carregando...</div>
          </div>
        ) : (
          <>
            {/* Tabela */}
            <div className="border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column.key} className={column.className}>
                        {column.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedData.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={columns.length}
                        className="h-24 text-center text-muted-foreground"
                      >
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginatedData.map((item, index) => (
                      <TableRow key={item.id || index}>
                        {columns.map((column) => (
                          <TableCell
                            key={column.key}
                            className={column.className}
                          >
                            {column.render
                              ? column.render(item)
                              : item[column.key]}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div className="text-sm text-muted-foreground">
                  Mostrando {startIndex + 1} a{' '}
                  {Math.min(startIndex + itemsPerPage, filteredData.length)} de{' '}
                  {filteredData.length} itens
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((prev) => Math.max(1, prev - 1))
                    }
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Anterior
                  </Button>

                  <div className="text-sm text-muted-foreground">
                    Página {currentPage} de {totalPages}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                    }
                    disabled={currentPage === totalPages}
                  >
                    Próxima
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

GenericTable.displayName = 'GenericTable';
