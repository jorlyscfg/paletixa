create or replace function public.normalize_catalog_sku(value text)
returns text
language sql
immutable
strict
set search_path = pg_catalog, public, pg_temp
as $$
  select regexp_replace(
    left(
      regexp_replace(
        regexp_replace(
          translate(
            replace(
              replace(
                replace(
                  replace(
                    replace(
                      replace(
                        replace(upper(btrim(regexp_replace(value, '\s+', ' ', 'g'))), 'Æ', 'AE'),
                        'Œ',
                        'OE'
                      ),
                      'Ð',
                      'D'
                    ),
                    'Ł',
                    'L'
                  ),
                  'Ø',
                  'O'
                ),
                'Þ',
                'TH'
              ),
              'ß',
              'SS'
            ),
            'ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝ',
            'AAAAAACEEEEIIIINOOOOOUUUUY'
          ),
          '[^A-Z0-9]+',
          '-',
          'g'
        ),
        '(^-+|-+$)',
        '',
        'g'
      ),
      80
    ),
    '-+$',
    '',
    'g'
  );
$$;
