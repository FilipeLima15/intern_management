<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Redirecionando - CEJUSC System</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root {
            --primary-color: #4361ee;
            --secondary-color: #3f37c9;
            --accent-color: #4cc9f0;
            --warning-color: #ff9e00;
            --text-color: #333;
            --light-bg: #f8f9fa;
            --white: #ffffff;
            --shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
            --transition: all 0.3s ease;
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }

        body {
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            min-height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }

        .container {
            max-width: 600px;
            width: 100%;
            background: var(--white);
            border-radius: 20px;
            box-shadow: var(--shadow);
            overflow: hidden;
            text-align: center;
            padding: 40px;
            position: relative;
        }

        .logo {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
            background: var(--primary-color);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 32px;
            font-weight: bold;
            box-shadow: 0 5px 15px rgba(67, 97, 238, 0.3);
        }

        h1 {
            color: var(--primary-color);
            margin-bottom: 15px;
            font-weight: 600;
        }

        p {
            color: var(--text-color);
            margin-bottom: 20px;
            line-height: 1.6;
        }

        .change-notice {
            background: rgba(255, 158, 0, 0.1);
            border-left: 4px solid var(--warning-color);
            padding: 15px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
            text-align: left;
            display: flex;
            align-items: flex-start;
        }

        .change-notice i {
            color: var(--warning-color);
            font-size: 20px;
            margin-right: 10px;
            margin-top: 2px;
        }

        .change-notice p {
            margin: 0;
            color: #7a5a00;
        }

        .countdown {
            display: flex;
            justify-content: center;
            margin: 30px 0;
        }

        .timer {
            width: 80px;
            height: 80px;
            border-radius: 50%;
            background: var(--light-bg);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            font-weight: bold;
            color: var(--primary-color);
            position: relative;
            box-shadow: inset 0 0 0 3px var(--primary-color);
        }

        .timer::after {
            content: '';
            position: absolute;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            border: 3px solid transparent;
            border-top-color: var(--accent-color);
            animation: spin 1s linear infinite;
        }

        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }

        .progress-bar {
            height: 6px;
            background: var(--light-bg);
            border-radius: 3px;
            margin: 30px 0;
            overflow: hidden;
        }

        .progress {
            height: 100%;
            width: 0%;
            background: linear-gradient(to right, var(--primary-color), var(--accent-color));
            border-radius: 3px;
            transition: width 1s linear;
        }

        .redirect-link {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: var(--primary-color);
            color: white;
            text-decoration: none;
            border-radius: 50px;
            font-weight: 500;
            transition: var(--transition);
            box-shadow: 0 4px 10px rgba(67, 97, 238, 0.3);
        }

        .redirect-link:hover {
            background: var(--secondary-color);
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(67, 97, 238, 0.4);
        }

        .footer {
            margin-top: 30px;
            color: #777;
            font-size: 14px;
        }

        @media (max-width: 480px) {
            .container {
                padding: 30px 20px;
            }
            
            h1 {
                font-size: 24px;
            }
            
            .change-notice {
                padding: 12px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">C</div>
        <h1>Redirecionando para o CEJUSC System</h1>
        <p>Você será redirecionado automaticamente para o novo sistema em instantes.</p>
        
        <div class="change-notice">
            <i class="fas fa-exclamation-circle"></i>
            <p><strong>Atenção:</strong> Nosso endereço mudou! Estamos direcionando você para nossa nova localização com melhor desempenho e recursos atualizados.</p>
        </div>
        
        <div class="countdown">
            <div class="timer" id="countdown">5</div>
        </div>
        
        <div class="progress-bar">
            <div class="progress" id="progress"></div>
        </div>
        
        <p>Se o redirecionamento não funcionar automaticamente, clique no botão abaixo:</p>
        <a href="https://e-cejusc3.github.io/cejusc-system/" class="redirect-link" id="manual-link">
            <i class="fas fa-external-link-alt"></i> Acessar CEJUSC System Agora
        </a>
        
        <div class="footer">
            CEJUSC System &copy; 2023
        </div>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', function() {
            const countdownElement = document.getElementById('countdown');
            const progressElement = document.getElementById('progress');
            const manualLink = document.getElementById('manual-link');
            
            let timeLeft = 5;
            const totalTime = 5;
            
            const countdownInterval = setInterval(function() {
                timeLeft--;
                countdownElement.textContent = timeLeft;
                progressElement.style.width = ((totalTime - timeLeft) / totalTime * 100) + '%';
                
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    window.location.href = 'https://e-cejusc3.github.io/cejusc-system/';
                }
            }, 1000);
            
            // Adicionar evento de clique para o link manual
            manualLink.addEventListener('click', function(e) {
                e.preventDefault();
                window.location.href = 'https://e-cejusc3.github.io/cejusc-system/';
            });
        });
    </script>
</body>
</html>
