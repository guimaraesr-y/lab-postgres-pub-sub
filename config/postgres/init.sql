CREATE TABLE IF NOT EXISTS tickets (
    id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('waiting', 'in_progress', 'resolved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO tickets (title, status)
VALUES
    ('Problema com pagamento', 'waiting'),
    ('Não consigo acessar minha conta', 'in_progress'),
    ('Alteração de endereço', 'resolved');
