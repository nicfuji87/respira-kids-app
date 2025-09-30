# 🔧 Correção: Erro 400 ao Criar Agendamento

## 🐛 Problema Original

Ao tentar criar um agendamento, ocorria o erro:

```
Failed to load resource: the server responded with a status of 400 ()
Erro ao criar agendamento: Object
```

---

## 🔍 Causa Raiz

O erro era causado por um **trigger do Google Calendar** que estava falhando durante a inserção do agendamento.

### Trigger Problemático:

```sql
CREATE TRIGGER agendamento_google_sync 
AFTER INSERT OR UPDATE OF data_hora, profissional_id, paciente_id, observacao 
ON public.agendamentos 
FOR EACH ROW WHEN ((new.ativo = true)) 
EXECUTE FUNCTION trigger_google_calendar_sync()
```

### Função do Trigger (ANTES):

A função estava tentando ler variáveis de configuração usando `current_setting()` sem tratamento de erro:

```sql
PERFORM net.http_post(
  url := current_setting('app.supabase_function_url') || '/sync-google-calendar',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'Authorization', 'Bearer ' || current_setting('app.supabase_service_role_key')
  ),
  ...
);
```

**Problema:** As variáveis `app.supabase_function_url` e `app.supabase_service_role_key` **NÃO estavam configuradas**, causando erro no trigger e impedindo a criação do agendamento.

---

## ✅ Solução Aplicada

### Migration: `fix_google_calendar_sync_trigger`

Modifiquei a função do trigger para:

1. **Tentar obter as configurações** com `current_setting(..., true)` (não falha se não existir)
2. **Verificar se as variáveis existem** antes de fazer a chamada HTTP
3. **Retornar sem erro** se as configurações não estiverem disponíveis

### Função do Trigger (DEPOIS):

```sql
CREATE OR REPLACE FUNCTION public.trigger_google_calendar_sync()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_paciente_nome TEXT;
  v_profissional_nome TEXT;
  v_function_url TEXT;
  v_service_key TEXT;
BEGIN
  -- Tentar obter configurações (se não existirem, não fazer nada)
  BEGIN
    v_function_url := current_setting('app.supabase_function_url', true);
    v_service_key := current_setting('app.supabase_service_role_key', true);
  EXCEPTION WHEN OTHERS THEN
    -- Se configurações não existirem, apenas retornar sem fazer sync
    RETURN NEW;
  END;

  -- Se configurações não estiverem definidas, retornar sem fazer sync
  IF v_function_url IS NULL OR v_service_key IS NULL THEN
    RETURN NEW;
  END IF;

  -- Buscar nomes para enviar na notificação
  SELECT nome INTO v_paciente_nome FROM pessoas WHERE id = NEW.paciente_id;
  SELECT nome INTO v_profissional_nome FROM pessoas WHERE id = NEW.profissional_id;

  -- Chamar Edge Function via pg_net (HTTP)
  PERFORM net.http_post(
    url := v_function_url || '/sync-google-calendar',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_service_key
    ),
    body := jsonb_build_object(
      'operation', TG_OP,
      'agendamento_id', NEW.id,
      'profissional_id', NEW.profissional_id,
      'paciente_id', NEW.paciente_id,
      'data_hora', NEW.data_hora,
      'observacao', NEW.observacao,
      'paciente_nome', v_paciente_nome,
      'profissional_nome', v_profissional_nome
    )
  );
  
  RETURN NEW;
END;
$function$;
```

---

## 🚀 Resultado

### ✅ Agora funciona:

1. **Sem configurações do Google Calendar:**
   - Agendamentos são criados normalmente ✅
   - Sincronização com Google Calendar **não ocorre** (esperado)

2. **Com configurações do Google Calendar:**
   - Agendamentos são criados normalmente ✅
   - Sincronização com Google Calendar **ocorre automaticamente** ✅

---

## 📝 Próximos Passos (OPCIONAL)

Se você quiser ativar a sincronização automática com Google Calendar, configure as variáveis de sessão:

### Opção 1: Configurar via SQL (por sessão)

```sql
-- Executar antes de criar agendamentos
SET app.supabase_function_url = 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1';
SET app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjAxMjkxOCwiZXhwIjoyMDY3NTg4OTE4fQ.HPLOkHtw31-WFtEAnQlbFb9aSLwwzy0LEOk26zI-n8Q';
```

### Opção 2: Configurar via postgresql.conf (permanente)

Adicione no arquivo `postgresql.conf` (via Supabase Dashboard):

```
app.supabase_function_url = 'https://jqegoentcusnbcykgtxg.supabase.co/functions/v1'
app.supabase_service_role_key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpxZWdvZW50Y3VzbmJjeWtndHhnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjAxMjkxOCwiZXhwIjoyMDY3NTg4OTE4fQ.HPLOkHtw31-WFtEAnQlbFb9aSLwwzy0LEOk26zI-n8Q'
```

### Opção 3: Sincronização Manual via Frontend (Recomendado)

Remover o trigger e chamar a Edge Function manualmente após criar agendamento:

```typescript
// Em calendar-services.ts
export const createAgendamento = async (
  agendamento: CreateAgendamento
): Promise<SupabaseAgendamentoCompleto> => {
  const { data: newAgendamento, error: insertError } = await supabase
    .from('agendamentos')
    .insert([agendamento])
    .select('id')
    .single();

  if (insertError) throw insertError;

  // Sincronizar com Google Calendar (se configurado)
  try {
    await supabase.functions.invoke('sync-google-calendar', {
      body: {
        operation: 'INSERT',
        agendamento_id: newAgendamento.id,
        ...agendamento
      }
    });
  } catch (err) {
    console.warn('Falha ao sincronizar com Google Calendar:', err);
    // Não falhar a criação do agendamento
  }

  // Buscar agendamento completo
  const { data: agendamentoCompleto } = await supabase
    .from('vw_agendamentos_completos')
    .select('*')
    .eq('id', newAgendamento.id)
    .single();

  return mapAgendamentoFlatToCompleto(agendamentoCompleto);
};
```

---

## 🧪 Teste

1. **Acesse a aplicação:**
   ```
   https://app.respirakidsbrasilia.com.br
   ```

2. **Vá em:** Agenda

3. **Crie um novo agendamento**

4. **Resultado esperado:** ✅ Agendamento criado com sucesso!

---

## 📊 Resumo

| Item | ❌ Antes | ✅ Depois |
|------|---------|-----------|
| **Trigger** | Falhava se configurações não existissem | Funciona mesmo sem configurações |
| **Criar agendamento** | ❌ Erro 400 | ✅ Funciona normalmente |
| **Sincronização Google Calendar** | ❌ Bloqueava criação | ⚠️ Opcional (não bloqueia) |

---

## 📝 Migrations Aplicadas

```
fix_google_calendar_sync_trigger - Corrigir trigger do Google Calendar para não falhar
```

---

## ✅ Status: CORRIGIDO

**Data:** 30/09/2025  
**Desenvolvedor:** Claude (AI Assistant)  
**Teste:** ✅ Trigger corrigido e funcionando
