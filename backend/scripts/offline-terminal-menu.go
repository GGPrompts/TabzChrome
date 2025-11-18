package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// Lip Gloss styles for different terminal types
var (
	// Claude Code style - warm orange
	claudeStyle = lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#ff6b35")).
		Padding(1, 2).
		Width(50)

	// OpenCode style - purple
	opencodeStyle = lipgloss.NewStyle().
		BorderStyle(lipgloss.RoundedBorder()).
		BorderForeground(lipgloss.Color("#8b5cf6")).
		Padding(1, 2).
		Width(50)

	// Bash style - green
	bashStyle = lipgloss.NewStyle().
		BorderStyle(lipgloss.DoubleBorder()).
		BorderForeground(lipgloss.Color("#10b981")).
		Padding(1, 2).
		Width(50)

	// Header styles
	headerStyle = lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("#ffd700")).
		MarginBottom(1)

	// Selected item style
	selectedStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#ffd700")).
		Bold(true).
		PaddingLeft(2)

	// Normal item style
	normalStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#94a3b8")).
		PaddingLeft(4)

	// Info text style
	infoStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#64748b")).
		Italic(true).
		MarginTop(1)

	// Hotkey style
	hotkeyStyle = lipgloss.NewStyle().
		Foreground(lipgloss.Color("#60a5fa")).
		MarginTop(1)
)

// Terminal types configuration
type TerminalConfig struct {
	Type       string
	Icon       string
	Name       string
	WorkingDir string
	Options    []Option
	Style      lipgloss.Style
}

type Option struct {
	Label  string
	Action string
	Key    string
}

// Bubble Tea model
type model struct {
	config   TerminalConfig
	cursor   int
	selected string
	quitting bool
}

func initialModel(termType, workingDir string) model {
	// Configure based on terminal type
	configs := map[string]TerminalConfig{
		"claude-code": {
			Type:       "claude-code",
			Icon:       "🤖",
			Name:       "Claude Code",
			WorkingDir: workingDir,
			Style:      claudeStyle,
			Options: []Option{
				{Label: "Resume last session", Action: "resume", Key: "enter"},
				{Label: "Start new session", Action: "new", Key: "n"},
				{Label: "Change directory", Action: "directory", Key: "d"},
				{Label: "View documentation", Action: "docs", Key: "h"},
				{Label: "Exit", Action: "exit", Key: "q"},
			},
		},
		"opencode": {
			Type:       "opencode",
			Icon:       "🟣",
			Name:       "OpenCode",
			WorkingDir: workingDir,
			Style:      opencodeStyle,
			Options: []Option{
				{Label: "Resume last session", Action: "resume", Key: "enter"},
				{Label: "Start new session", Action: "new", Key: "n"},
				{Label: "Change directory", Action: "directory", Key: "d"},
				{Label: "View documentation", Action: "docs", Key: "h"},
				{Label: "Exit", Action: "exit", Key: "q"},
			},
		},
		"bash": {
			Type:       "bash",
			Icon:       ">_",
			Name:       "Bash Terminal",
			WorkingDir: workingDir,
			Style:      bashStyle,
			Options: []Option{
				{Label: "Start shell", Action: "start", Key: "enter"},
				{Label: "Run command", Action: "command", Key: "c"},
				{Label: "Change directory", Action: "directory", Key: "d"},
				{Label: "Exit", Action: "exit", Key: "q"},
			},
		},
	}

	config, exists := configs[termType]
	if !exists {
		config = configs["bash"] // Default to bash
	}

	return model{
		config: config,
		cursor: 0,
	}
}

// Init returns an initial command
func (m model) Init() tea.Cmd {
	return nil
}

// Update handles messages
func (m model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "q":
			m.quitting = true
			return m, tea.Quit

		case "up", "k":
			if m.cursor > 0 {
				m.cursor--
			}

		case "down", "j":
			if m.cursor < len(m.config.Options)-1 {
				m.cursor++
			}

		case "enter", " ":
			m.selected = m.config.Options[m.cursor].Action
			m.quitting = true
			return m, tea.Quit

		// Handle specific hotkeys
		case "n":
			for i, opt := range m.config.Options {
				if opt.Key == "n" {
					m.cursor = i
					m.selected = opt.Action
					m.quitting = true
					return m, tea.Quit
				}
			}

		case "d":
			for i, opt := range m.config.Options {
				if opt.Key == "d" {
					m.cursor = i
					m.selected = opt.Action
					m.quitting = true
					return m, tea.Quit
				}
			}
		}
	}

	return m, nil
}

// View renders the UI
func (m model) View() string {
	if m.quitting && m.selected != "" {
		// Output the selected action for the shell script to handle
		return fmt.Sprintf("ACTION:%s\n", m.selected)
	}

	// Build the header
	header := headerStyle.Render(
		fmt.Sprintf("%s %s - Offline", m.config.Icon, m.config.Name),
	)

	// Build the menu items
	menu := ""
	for i, option := range m.config.Options {
		cursor := "  "
		style := normalStyle

		if m.cursor == i {
			cursor = "▸ "
			style = selectedStyle
		}

		item := fmt.Sprintf("%s%s", cursor, option.Label)
		menu += style.Render(item) + "\n"
	}

	// Working directory info
	info := infoStyle.Render(
		fmt.Sprintf("📁 %s", m.config.WorkingDir),
	)

	// Hotkeys
	hotkeys := hotkeyStyle.Render(
		"↑/↓ Navigate • Enter Select • q Quit",
	)

	// Combine everything with the terminal-specific style
	content := lipgloss.JoinVertical(
		lipgloss.Left,
		header,
		menu,
		info,
		hotkeys,
	)

	return m.config.Style.Render(content)
}

func main() {
	// Get terminal type and working dir from args
	termType := "bash"
	workingDir := "~/workspace"

	if len(os.Args) > 1 {
		termType = os.Args[1]
	}
	if len(os.Args) > 2 {
		workingDir = os.Args[2]
	}

	// Create and run the Bubble Tea program
	p := tea.NewProgram(initialModel(termType, workingDir))

	finalModel, err := p.Run()
	if err != nil {
		fmt.Printf("Error: %v", err)
		os.Exit(1)
	}

	// Check if an action was selected
	if m, ok := finalModel.(model); ok && m.selected != "" {
		// The view already printed the action
		os.Exit(0)
	}
}