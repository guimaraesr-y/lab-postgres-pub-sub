# 🐘 PostgreSQL LISTEN/NOTIFY Lab

> Um laboratório prático para explorar comunicação assíncrona e Server-Sent Events (SSE) em aplicações distribuídas usando apenas o PostgreSQL.

A proposta deste projeto não é construir um *message broker* caseiro. O objetivo é responder a uma pergunta técnica pragmática: **Até onde podemos chegar usando o banco de dados que a aplicação já possui antes de introduzir uma infraestrutura dedicada para realtime (como Redis)?**

Para testar isso, o repositório implementa o minimundo **Northstar Support**: um dashboard de suporte em que operadores conectados a diferentes instâncias da API precisam enxergar mudanças de tickets em tempo real.

## 🛠️ Stack Tecnológica

* **Bun 1.4** (`Bun.serve`) com cliente PostgreSQL nativo (`SQL`)
* **PostgreSQL 18**
* **Nginx** (como Load Balancer)
* **Docker Compose**
* *Zero dependências npm!*

## 🔍 Arquitetura e Cenário

Quando o backend escala para múltiplas instâncias atrás de um Load Balancer, surge um problema de estado: se o Operador A atualiza o ticket `#1042` através da `API-1`, como a `API-3` fica sabendo para avisar os usuários conectados a ela?

Em vez de adicionar o Redis, usamos o PostgreSQL como coordenador:

```text
┌───────────────┐       UPDATE       ┌──────────────────────┐
│  Operador A   │───────────────────►│      PostgreSQL      │
│   (API-1)     │                    │                      │
│ altera ticket │                    │   tabela: tickets    │
└───────────────┘                    └──────────┬───────────┘
                                                │
                                         NOTIFY '1042'
                                                │
                                 ┌──────────────┼──────────────┐
                                 ▼             ▼              ▼
                            ┌─────────┐     ┌─────────┐     ┌─────────┐
                            │  API-1  │     │  API-2  │     │  API-3  │
                            └────┬────┘     └────┬────┘     └────┬────┘
                                 │ SSE           │ SSE           │ SSE
                                 ▼              ▼               ▼
                             Browsers       Browsers        Browsers

```

### O Fluxo no Banco

O código na API realiza a atualização e a notificação na mesma transação. O `NOTIFY` carrega apenas o ID do ticket alterado:

```sql
BEGIN;

UPDATE tickets SET status = 'in_progress' WHERE id = 1042;

NOTIFY ticket_changed, '1042';

COMMIT;

```

Todas as instâncias mantêm uma conexão executando `LISTEN ticket_changed;`. Ao receber o sinal, elas buscam o estado atualizado no banco e disparam o evento via SSE para seus clientes.

## 🧠 Conceitos Chave Demonstrados

* **Estado vs. Sinal:** O `NOTIFY` trafega apenas o sinal, não o JSON completo. O PostgreSQL permanece como a fonte da verdade.
* **Propriedade Transacional:** A notificação obedece à transação. Um `ROLLBACK` cancela o envio; um `COMMIT` garante que o evento realtime só ocorra se o dado foi efetivamente salvo.
* **Mensagens Efêmeras:** Não há persistência de mensagens, ACK ou Retry. Se uma API estiver offline durante o `NOTIFY`, ela perde o sinal. Porém, **perder o evento realtime não corrompe o estado**, já que o ticket atualizado está seguro no banco.

## ⚖️ Quando usar?

| Tecnologia | Semântica | Quando usar? |
| --- | --- | --- |
| **PostgreSQL (LISTEN/NOTIFY)** | *"Algo mudou no banco."* | O estado já está no banco e a perda de um evento em tempo real não significa perda do estado real. |
| **Redis (Pub/Sub)** | *"Algo acabou de acontecer."* | Comunicação efêmera de alta velocidade, especialmente se o Redis já existir na infraestrutura. |
| **RabbitMQ / SQS** | *"Este trabalho PRECISA ser feito."* | Quando a mensagem representa um processamento que exige garantias de entrega (ACK, Retry, DLQ). |

---

## 🚀 Como Executar o Laboratório

Suba toda a infraestrutura com o Docker Compose:

```bash
docker compose up --build

```

Acesse **http://localhost:8080** no navegador para usar o dashboard visual. Como estamos usando um Load Balancer (Nginx), cada requisição ou conexão SSE pode cair em uma instância diferente.

**Serviços expostos:**

* `http://localhost:8080` - Nginx / Load Balancer
* `http://localhost:3001` - API-1 (direta)
* `http://localhost:3002` - API-2 (direta)
* `localhost:5432` - PostgreSQL

### 🧪 Demonstração Cross-Instance

Para provar que a comunicação entre as instâncias funciona, abra dois terminais:

**Terminal 1:** Conecte-se ao SSE diretamente na `API-2`:

```bash
curl -N http://localhost:3002/events

```

**Terminal 2:** Atualize um ticket disparando um PATCH diretamente para a `API-1`:

```bash
curl -sS -X PATCH http://localhost:3001/tickets/1 \
  -H 'content-type: application/json' \
  -d '{"status":"in_progress"}'

```

**Resultado esperado no Terminal 1:**
A `API-2` receberá o `NOTIFY` do banco, fará a consulta do ticket e enviará para você:

```text
event: connected
data: {"instance":"api-2","connectedAt":"..."}

event: ticket.changed
data: {"ticket":{"id":1,"status":"in_progress",...},"deliveredBy":"api-2"}

```

*(Dica: Acompanhe os logs em tempo real usando `docker compose logs -f api-1 api-2`)*

### 📍 Rotas da API

* `GET /`
* `GET /health`
* `GET /events`
* `GET /tickets`
* `GET /tickets/:id`
* `PATCH /tickets/:id` *(Status válidos: `waiting`, `in_progress`, `resolved`)*

### 🧹 Reset do Banco

O `init.sql` roda apenas na criação inicial do volume do Postgres. Para resetar os dados e recriar os tickets de exemplo, destrua o volume e suba novamente:

```bash
docker compose down -v
docker compose up --build
```
