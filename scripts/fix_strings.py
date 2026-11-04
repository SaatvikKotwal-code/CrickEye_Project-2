def main():
    with open('App.js', 'r', encoding='utf-8') as f:
        text = f.read()

    # Clean any em dashes and ellipses in strings
    text = text.replace("'DISCONNECTED — retrying'", "'DISCONNECTED - retrying'")
    text = text.replace('id="procFrame">—</span>', 'id="procFrame">--</span>')
    text = text.replace('id="procEta">—</span>', 'id="procEta">--</span>')
    text = text.replace('AI Models Loaded — Starting ball tracking & pose analysis…', 'AI Models Loaded - Starting ball tracking & pose analysis...')
    text = text.replace('Initialising…', 'Initialising...')

    with open('App.js', 'w', encoding='utf-8') as f:
        f.write(text)
    print("App.js strings updated cleanly")

if __name__ == '__main__':
    main()

