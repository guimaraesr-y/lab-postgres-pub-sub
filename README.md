# 🐘 PostgreSQL LISTEN/NOTIFY Lab

> Um laboratório prático para explorar comunicação assíncrona e Server-Sent Events (SSE) em aplicações distribuídas usando apenas o PostgreSQL.

A proposta deste projeto não é construir um *message broker* caseiro. O objetivo é responder a uma pergunta técnica pragmática: **Até onde podemos chegar usando o banco de dados que a aplicação já possui antes de introduzir uma infraestrutura dedicada para realtime (como Redis)?**

Para testar isso, o repositório implementa um cenário realista usando `LISTEN/NOTIFY` como camada de sinalização entre múltiplas instâncias de uma API.

## 🔍 Arquitetura e Cenário

Imagine um SaaS de suporte técnico, a Northstar Support. Os operadores acompanham as mudanças de status dos tickets em tempo real no navegador via **Server-Sent Events (SSE)**.

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
                                 ▼              ▼              ▼
                            ┌─────────┐     ┌─────────┐     ┌─────────┐
                            │  API-1  │     │  API-2  │     │  API-3  │
                            └────┬────┘     └────┬────┘     └────┬────┘
                                 │ SSE          │ SSE           │ SSE
                                 ▼              ▼               ▼
                             Browsers       Browsers        Browsers

```

### O Fluxo no Banco

O código na API realiza a atualização e a notificação na mesma transação:

```sql
BEGIN;

UPDATE tickets SET status = 'in_progress' WHERE id = 1042;

-- O payload carrega apenas o ID do recurso alterado.
NOTIFY ticket_changed, '1042';

COMMIT;

```

Todas as instâncias mantêm uma conexão executando `LISTEN ticket_changed;`. Ao receber o sinal, elas buscam o estado atualizado no banco (se tiverem clientes interessados) e disparam o evento via SSE.

## 🧠 Conceitos Chave Demonstrados

* **Estado vs. Sinal:** O `NOTIFY` trafega apenas o ID (sinal), não o JSON completo do ticket. O PostgreSQL continua sendo a única fonte da verdade.
* **Propriedade Transacional:** A notificação obedece à transação. Um `ROLLBACK` cancela o envio; um `COMMIT` garante que o evento realtime só ocorra se o dado foi efetivamente salvo.
* **Fan-out Natural:** Todas as instâncias recebem o sinal simultaneamente, resolvendo o problema de sincronização de estado entre os nós da API.
* **Mensagens Efêmeras:** Não há persistência de mensagens, ACK, Retry ou DLQ. Se uma API estiver offline durante o `NOTIFY`, ela perde o sinal. Porém, **perder o evento realtime não corrompe o estado**, já que o dado atualizado está seguro no banco.

## ⚖️ Quando usar?

Se a necessidade de escalabilidade exigir um componente externo, o modelo mental para escolha de tecnologia é:

| Tecnologia | Semântica | Quando usar? |
| --- | --- | --- |
| **PostgreSQL (LISTEN/NOTIFY)** | *"Algo mudou no banco."* | O estado já está no banco e a perda de um evento em tempo real não significa perda do estado real (ex: o cliente pode dar refresh na tela). |
| **Redis (Pub/Sub)** | *"Algo acabou de acontecer."* | Comunicação efêmera de alta velocidade, especialmente se o Redis já existir na infraestrutura para cache ou controle de sessão. |
| **RabbitMQ / SQS** | *"Este trabalho PRECISA ser feito."* | Quando a mensagem representa um processamento que exige garantias de entrega (ACK, Retry, filas persistentes, DLQ). |

A grande reflexão aqui é: se tudo que as instâncias precisam saber é que *"o ticket 1042 mudou"*, vale a pena operar um cluster Redis apenas para isso?

## 🚀 Como executar

*(Instruções para iniciar o banco, subir múltiplas instâncias da API e abrir os clientes conectados via SSE)*
